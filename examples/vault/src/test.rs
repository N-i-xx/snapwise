use super::*;
use soroban_sdk::testutils::Address as _;
use soroban_sdk::token::StellarAssetClient;

struct Setup<'a> {
    env: Env,
    vault: VaultClient<'a>,
    token: token::Client<'a>,
    user: Address,
}

fn setup<'a>() -> Setup<'a> {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let issuer = Address::generate(&env);
    let sac = env.register_stellar_asset_contract_v2(issuer);
    let vault_id = env.register(Vault, (&admin, &sac.address()));
    let user = Address::generate(&env);
    StellarAssetClient::new(&env, &sac.address()).mint(&user, &1_000);
    Setup {
        vault: VaultClient::new(&env, &vault_id),
        token: token::Client::new(&env, &sac.address()),
        user,
        env,
    }
}

#[test]
fn deposit_records_shares() {
    let s = setup();
    assert_eq!(s.vault.deposit(&s.user, &400), 400);
    assert_eq!(s.vault.shares(&s.user), 400);
    assert_eq!(s.vault.total_shares(), 400);
    assert_eq!(s.token.balance(&s.user), 600);
}

#[test]
fn withdraw_returns_tokens() {
    let s = setup();
    s.vault.deposit(&s.user, &400);
    assert_eq!(s.vault.withdraw(&s.user, &150), 250);
    assert_eq!(s.token.balance(&s.user), 750);
}

#[test]
fn withdraw_more_than_shares_fails() {
    let s = setup();
    s.vault.deposit(&s.user, &100);
    assert_eq!(
        s.vault.try_withdraw(&s.user, &101),
        Err(Ok(VaultError::InsufficientShares))
    );
}

#[test]
fn two_users_are_independent() {
    let s = setup();
    let other = Address::generate(&s.env);
    StellarAssetClient::new(&s.env, &s.token.address).mint(&other, &500);
    s.vault.deposit(&s.user, &100);
    s.vault.deposit(&other, &300);
    assert_eq!(s.vault.shares(&s.user), 100);
    assert_eq!(s.vault.shares(&other), 300);
    assert_eq!(s.vault.total_shares(), 400);
}

/// Test snapshots record the events of the *last* top-level invocation only,
/// so this test ends with the call whose events we want reviewed.
#[test]
fn deposit_emits_event() {
    let s = setup();
    s.vault.deposit(&s.user, &250);
}
