<!-- snapwise:report -->
### 🔎 Snapwise: test snapshot review

**5 changed** · 0 added · 0 removed · 0 unchanged

🔐 auth changed in 5 · 🗄️ storage in 5 · ⏳ TTL in 5 · 📣 events in 1

| Test | Status | Storage | TTL | Events | Auth |
|---|---|---|---|---|---|
| `vault › test::deposit_emits_event` | changed | ~3 +1 | 1 | +4 −2 | ⚠️ +2 −1 |
| `vault › test::deposit_records_shares` | changed | ~3 +1 | 1 |  | ⚠️ +2 −1 |
| `vault › test::two_users_are_independent` | changed | ~4 +1 | 2 |  | ⚠️ +4 −2 |
| `vault › test::withdraw_more_than_shares_fails` | changed | ~3 +1 | 1 |  | ⚠️ +2 −1 |
| `vault › test::withdraw_returns_tokens` | changed | ~3 +1 | 1 |  | ⚠️ +2 −1 |

<details><summary><code>vault › test::deposit_emits_event</code></summary>

File: `vault/test_snapshots/test/deposit_emits_event.1.json`

**Storage**

| | Entry | Before | After |
|---|---|---|---|
| ✏️ | CAAA…ITA4 persistent <code>Shares(CAAA…K3IM)</code> | <code>250i128</code> <sub>**live until 518400**</sub> | <code>248i128</code> <sub>**live until 1036800**</sub> |
| ✏️ | CAAA…ITA4 instance <code>TotalShares</code> | <code>250i128</code> | <code>248i128</code> |
| ✏️ | CBUS…IUNF persistent <code>Balance(CAAA…ITA4)</code> | <code>{amount: 250i128, authorized: true, clawback: false}</code> <sub>live until 518400</sub> | <code>{amount: 248i128, authorized: true, clawback: false}</code> <sub>live until 518400</sub> |
| ➕ | CBUS…IUNF persistent <code>Balance(CAAA…D2KM)</code> |  | <code>{amount: 2i128, authorized: true, clawback: false}</code> <sub>live until 518400</sub> |

**Events** (last call)

```diff
- CBUS…IUNF: transfer(CAAA…K3IM, CAAA…ITA4, "aaa:GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGO6V") → 250i128
- CAAA…ITA4: deposited(CAAA…K3IM) → {amount: 250i128}
+ CBUS…IUNF: transfer(CAAA…K3IM, CAAA…ITA4, "aaa:GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGO6V") → 248i128
+ CBUS…IUNF: transfer(CAAA…K3IM, CAAA…D2KM, "aaa:GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGO6V") → 2i128
+ CAAA…ITA4: fee_charged(CAAA…K3IM) → {fee: 2i128}
+ CAAA…ITA4: deposited(CAAA…K3IM) → {amount: 248i128}
```

**Auth** ⚠️

```diff
  …
  CAAA…FCT4 authorized CBUS…IUNF.mint(CAAA…K3IM, 1000i128)
  CAAA…K3IM authorized CAAA…ITA4.deposit(CAAA…K3IM, 250i128)
-   └ CBUS…IUNF.transfer(CAAA…K3IM, CAAA…ITA4, 250i128)
+   └ CBUS…IUNF.transfer(CAAA…K3IM, CAAA…ITA4, 248i128)
+   └ CBUS…IUNF.transfer(CAAA…K3IM, CAAA…D2KM, 2i128)
```

</details>
<details><summary><code>vault › test::deposit_records_shares</code></summary>

File: `vault/test_snapshots/test/deposit_records_shares.1.json`

**Storage**

| | Entry | Before | After |
|---|---|---|---|
| ✏️ | CAAA…ITA4 persistent <code>Shares(CAAA…K3IM)</code> | <code>400i128</code> <sub>**live until 518400**</sub> | <code>396i128</code> <sub>**live until 1036800**</sub> |
| ✏️ | CAAA…ITA4 instance <code>TotalShares</code> | <code>400i128</code> | <code>396i128</code> |
| ✏️ | CBUS…IUNF persistent <code>Balance(CAAA…ITA4)</code> | <code>{amount: 400i128, authorized: true, clawback: false}</code> <sub>live until 518400</sub> | <code>{amount: 396i128, authorized: true, clawback: false}</code> <sub>live until 518400</sub> |
| ➕ | CBUS…IUNF persistent <code>Balance(CAAA…D2KM)</code> |  | <code>{amount: 4i128, authorized: true, clawback: false}</code> <sub>live until 518400</sub> |

**Auth** ⚠️

```diff
  …
  CAAA…FCT4 authorized CBUS…IUNF.mint(CAAA…K3IM, 1000i128)
  CAAA…K3IM authorized CAAA…ITA4.deposit(CAAA…K3IM, 400i128)
-   └ CBUS…IUNF.transfer(CAAA…K3IM, CAAA…ITA4, 400i128)
+   └ CBUS…IUNF.transfer(CAAA…K3IM, CAAA…ITA4, 396i128)
+   └ CBUS…IUNF.transfer(CAAA…K3IM, CAAA…D2KM, 4i128)
```

</details>
<details><summary><code>vault › test::two_users_are_independent</code></summary>

File: `vault/test_snapshots/test/two_users_are_independent.1.json`

**Storage**

| | Entry | Before | After |
|---|---|---|---|
| ✏️ | CAAA…ITA4 persistent <code>Shares(CAAA…K3IM)</code> | <code>100i128</code> <sub>**live until 518400**</sub> | <code>99i128</code> <sub>**live until 1036800**</sub> |
| ✏️ | CAAA…ITA4 persistent <code>Shares(CAAA…MDR4)</code> | <code>300i128</code> <sub>**live until 518400**</sub> | <code>297i128</code> <sub>**live until 1036800**</sub> |
| ✏️ | CAAA…ITA4 instance <code>TotalShares</code> | <code>400i128</code> | <code>396i128</code> |
| ✏️ | CBUS…IUNF persistent <code>Balance(CAAA…ITA4)</code> | <code>{amount: 400i128, authorized: true, clawback: false}</code> <sub>live until 518400</sub> | <code>{amount: 396i128, authorized: true, clawback: false}</code> <sub>live until 518400</sub> |
| ➕ | CBUS…IUNF persistent <code>Balance(CAAA…D2KM)</code> |  | <code>{amount: 4i128, authorized: true, clawback: false}</code> <sub>live until 518400</sub> |

**Auth** ⚠️

```diff
  …
  CAAA…FCT4 authorized CBUS…IUNF.mint(CAAA…MDR4, 500i128)
  CAAA…K3IM authorized CAAA…ITA4.deposit(CAAA…K3IM, 100i128)
-   └ CBUS…IUNF.transfer(CAAA…K3IM, CAAA…ITA4, 100i128)
+   └ CBUS…IUNF.transfer(CAAA…K3IM, CAAA…ITA4, 99i128)
+   └ CBUS…IUNF.transfer(CAAA…K3IM, CAAA…D2KM, 1i128)
  CAAA…MDR4 authorized CAAA…ITA4.deposit(CAAA…MDR4, 300i128)
-   └ CBUS…IUNF.transfer(CAAA…MDR4, CAAA…ITA4, 300i128)
+   └ CBUS…IUNF.transfer(CAAA…MDR4, CAAA…ITA4, 297i128)
+   └ CBUS…IUNF.transfer(CAAA…MDR4, CAAA…D2KM, 3i128)
```

</details>
<details><summary><code>vault › test::withdraw_more_than_shares_fails</code></summary>

File: `vault/test_snapshots/test/withdraw_more_than_shares_fails.1.json`

**Storage**

| | Entry | Before | After |
|---|---|---|---|
| ✏️ | CAAA…ITA4 persistent <code>Shares(CAAA…K3IM)</code> | <code>100i128</code> <sub>**live until 518400**</sub> | <code>99i128</code> <sub>**live until 1036800**</sub> |
| ✏️ | CAAA…ITA4 instance <code>TotalShares</code> | <code>100i128</code> | <code>99i128</code> |
| ✏️ | CBUS…IUNF persistent <code>Balance(CAAA…ITA4)</code> | <code>{amount: 100i128, authorized: true, clawback: false}</code> <sub>live until 518400</sub> | <code>{amount: 99i128, authorized: true, clawback: false}</code> <sub>live until 518400</sub> |
| ➕ | CBUS…IUNF persistent <code>Balance(CAAA…D2KM)</code> |  | <code>{amount: 1i128, authorized: true, clawback: false}</code> <sub>live until 518400</sub> |

**Auth** ⚠️

```diff
  …
  CAAA…FCT4 authorized CBUS…IUNF.mint(CAAA…K3IM, 1000i128)
  CAAA…K3IM authorized CAAA…ITA4.deposit(CAAA…K3IM, 100i128)
-   └ CBUS…IUNF.transfer(CAAA…K3IM, CAAA…ITA4, 100i128)
+   └ CBUS…IUNF.transfer(CAAA…K3IM, CAAA…ITA4, 99i128)
+   └ CBUS…IUNF.transfer(CAAA…K3IM, CAAA…D2KM, 1i128)
```

</details>
<details><summary><code>vault › test::withdraw_returns_tokens</code></summary>

File: `vault/test_snapshots/test/withdraw_returns_tokens.1.json`

**Storage**

| | Entry | Before | After |
|---|---|---|---|
| ✏️ | CAAA…ITA4 persistent <code>Shares(CAAA…K3IM)</code> | <code>250i128</code> <sub>**live until 518400**</sub> | <code>246i128</code> <sub>**live until 1036800**</sub> |
| ✏️ | CAAA…ITA4 instance <code>TotalShares</code> | <code>250i128</code> | <code>246i128</code> |
| ✏️ | CBUS…IUNF persistent <code>Balance(CAAA…ITA4)</code> | <code>{amount: 250i128, authorized: true, clawback: false}</code> <sub>live until 518400</sub> | <code>{amount: 246i128, authorized: true, clawback: false}</code> <sub>live until 518400</sub> |
| ➕ | CBUS…IUNF persistent <code>Balance(CAAA…D2KM)</code> |  | <code>{amount: 4i128, authorized: true, clawback: false}</code> <sub>live until 518400</sub> |

**Auth** ⚠️

```diff
  …
  CAAA…FCT4 authorized CBUS…IUNF.mint(CAAA…K3IM, 1000i128)
  CAAA…K3IM authorized CAAA…ITA4.deposit(CAAA…K3IM, 400i128)
-   └ CBUS…IUNF.transfer(CAAA…K3IM, CAAA…ITA4, 400i128)
+   └ CBUS…IUNF.transfer(CAAA…K3IM, CAAA…ITA4, 396i128)
+   └ CBUS…IUNF.transfer(CAAA…K3IM, CAAA…D2KM, 4i128)
  CAAA…K3IM authorized CAAA…ITA4.withdraw(CAAA…K3IM, 150i128)
```

</details>

<sub>Compared `main` → `feature` · events show the last call of each test only · [Snapwise](https://github.com/Ike-Nathan/snapwise)</sub>