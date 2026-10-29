//! A minimal token vault used as the Snapwise demo contract.
//!
//! Users deposit a Stellar Asset Contract token and receive shares 1:1.
//! Every state change emits an event, so the test snapshots capture
//! storage, events and auth trees that Snapwise can review.
#![no_std]

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, token, Address, Env,
};

/// Persistent entries are kept alive for roughly 30 days (at ~5s ledgers)
/// whenever they are written, once they drop below roughly 7 days.
const BUMP_THRESHOLD: u32 = 120_960;
const BUMP_TO: u32 = 518_400;

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    Token,
    TotalShares,
    Shares(Address),
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum VaultError {
    InvalidAmount = 1,
    InsufficientShares = 2,
}

#[contractevent]
pub struct Deposited {
    #[topic]
    pub user: Address,
    pub amount: i128,
}

#[contractevent]
pub struct Withdrawn {
    #[topic]
    pub user: Address,
    pub amount: i128,
}

#[contract]
pub struct Vault;

#[contractimpl]
impl Vault {
    pub fn __constructor(env: Env, admin: Address, token: Address) {
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Token, &token);
        env.storage().instance().set(&DataKey::TotalShares, &0i128);
    }

    /// Moves `amount` of the vault token from `user` into the vault.
    pub fn deposit(env: Env, user: Address, amount: i128) -> Result<i128, VaultError> {
        user.require_auth();
        if amount <= 0 {
            return Err(VaultError::InvalidAmount);
        }
        token_client(&env).transfer(&user, &env.current_contract_address(), &amount);

        let shares = shares_of(&env, &user) + amount;
        set_shares(&env, &user, shares);
        let total: i128 = env.storage().instance().get(&DataKey::TotalShares).unwrap_or(0);
        env.storage()
            .instance()
            .set(&DataKey::TotalShares, &(total + amount));

        Deposited { user, amount }.publish(&env);
        Ok(shares)
    }

    /// Burns `amount` shares and returns the same amount of tokens to `user`.
    pub fn withdraw(env: Env, user: Address, amount: i128) -> Result<i128, VaultError> {
        user.require_auth();
        if amount <= 0 {
            return Err(VaultError::InvalidAmount);
        }
        let shares = shares_of(&env, &user);
        if shares < amount {
            return Err(VaultError::InsufficientShares);
        }
        set_shares(&env, &user, shares - amount);
        let total: i128 = env.storage().instance().get(&DataKey::TotalShares).unwrap_or(0);
        env.storage()
            .instance()
            .set(&DataKey::TotalShares, &(total - amount));
        token_client(&env).transfer(&env.current_contract_address(), &user, &amount);

        Withdrawn { user, amount }.publish(&env);
        Ok(shares - amount)
    }

    pub fn shares(env: Env, user: Address) -> i128 {
        shares_of(&env, &user)
    }

    pub fn total_shares(env: Env) -> i128 {
        env.storage().instance().get(&DataKey::TotalShares).unwrap_or(0)
    }
}

fn token_client(env: &Env) -> token::Client<'_> {
    let token: Address = env.storage().instance().get(&DataKey::Token).unwrap();
    token::Client::new(env, &token)
}

fn shares_of(env: &Env, user: &Address) -> i128 {
    env.storage()
        .persistent()
        .get(&DataKey::Shares(user.clone()))
        .unwrap_or(0)
}

fn set_shares(env: &Env, user: &Address, shares: i128) {
    let key = DataKey::Shares(user.clone());
    env.storage().persistent().set(&key, &shares);
    env.storage()
        .persistent()
        .extend_ttl(&key, BUMP_THRESHOLD, BUMP_TO);
}

#[cfg(test)]
mod test;
