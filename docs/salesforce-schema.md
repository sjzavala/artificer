# Salesforce schema

Artificer writes four related custom objects on approval. This document is the
contract: the API names below are exactly what `lib/salesforce/mapping.ts`
sends, so wiring a real org is a copy-paste job rather than a reverse-engineering
one.

The mock adapter creates records with these same names, which is why the record
view at `/records/[id]` looks like a preview of the real thing.

## Relationship model

```
Property__c ─┐
Tenant__c ───┼──> Lease__c ──┐
             │               │
             └───────────────┴──> Deal__c
```

- `Lease__c` looks up to `Property__c` and `Tenant__c`.
- `Deal__c` looks up to all three and is the record a user lands on after approval.

## Property__c

| Field label | API name | Type | Notes |
| --- | --- | --- | --- |
| Property Name | `Name` | Text(80) | Standard field. Composed as `street, city, state`. |
| Street Address | `Street_Address__c` | Text(255) | |
| City | `City__c` | Text(100) | |
| State | `State__c` | Text(2) | USPS abbreviation, uppercase. |
| Postal Code | `Postal_Code__c` | Text(10) | |
| Property Type | `Property_Type__c` | Picklist | `retail`, `industrial`, `office`, `other` |
| Building SF | `Building_SF__c` | Number(10, 0) | |
| Lot Size (Acres) | `Lot_Size_Acres__c` | Number(10, 2) | |
| Year Built | `Year_Built__c` | Number(4, 0) | |

## Tenant__c

| Field label | API name | Type | Notes |
| --- | --- | --- | --- |
| Tenant Name | `Name` | Text(80) | Standard field. The trade name. |
| Legal Entity Name | `Legal_Entity_Name__c` | Text(255) | The signing entity, often not the trade name. |
| Guarantor Name | `Guarantor_Name__c` | Text(255) | |
| Guarantor Type | `Guarantor_Type__c` | Picklist | `corporate`, `franchisee`, `personal`, `none` |
| Credit Rating | `Credit_Rating__c` | Text(50) | As stated in the document, agency included. |

## Lease__c

| Field label | API name | Type | Notes |
| --- | --- | --- | --- |
| Lease Name | `Name` | Text(80) | Standard field. |
| Lease Type | `Lease_Type__c` | Picklist | `NNN`, `NN`, `absolute NNN`, `gross`, `modified gross` |
| Commencement Date | `Commencement_Date__c` | Date | |
| Expiration Date | `Expiration_Date__c` | Date | Primary term only, excluding options. |
| Remaining Term (Years) | `Remaining_Term_Years__c` | Number(4, 1) | |
| Renewal Options | `Renewal_Options__c` | Text(100) | Compact form, e.g. `4 x 5yr`. |
| Rent Escalations | `Rent_Escalations__c` | Text(255) | e.g. `10% every 5 years`. |
| Landlord Responsibilities | `Landlord_Responsibilities__c` | Long Text Area(1000) | |
| Property | `Property__c` | Lookup(Property__c) | |
| Tenant | `Tenant__c` | Lookup(Tenant__c) | |

## Deal__c

| Field label | API name | Type | Notes |
| --- | --- | --- | --- |
| Deal Name | `Name` | Text(80) | Standard field. `Tenant — City, ST`. |
| Asking Price | `Asking_Price__c` | Currency(16, 0) | |
| Annual Base Rent | `Annual_Base_Rent__c` | Currency(16, 0) | NOI when stated separately. |
| Cap Rate | `Cap_Rate__c` | Percent(5, 2) | Stored as `6.75` meaning 6.75%. |
| Price Per SF | `Price_Per_SF__c` | Currency(10, 2) | |
| Status | `Status__c` | Picklist | Artificer writes `Approved`. |
| Source Document | `Source_Document__c` | Text(255) | Original file name. |
| Artificer Deal Id | `Artificer_Deal_Id__c` | Text(64) | Links the CRM record back to the deal in Artificer. |
| **Deal Hash** | `Deal_Hash__c` | **Text(64) (External ID, Unique)** | **Required for idempotency — see below.** |
| Property | `Property__c` | Lookup(Property__c) | |
| Tenant | `Tenant__c` | Lookup(Tenant__c) | |
| Lease | `Lease__c` | Lookup(Lease__c) | |

## Idempotency

`Deal_Hash__c` is a SHA-256 digest of the approved business values only —
confidence scores, citations and the edited flag are excluded, so re-approving a
deal whose values have not changed produces the same hash.

The real adapter queries `Deal__c` by `Deal_Hash__c` before writing. A hit means
the four records are updated in place; a miss means a new set is created. Mark
the field as an **External ID** and **Unique** so the org enforces this too, not
just the application.

If a reviewer corrects a value and re-approves, the hash changes and a new record
set is created — which is the intended behaviour. The audit log holds the trail
between the two.

## Creating the objects

Quickest path for a Developer Edition org:

1. Setup → Object Manager → Create → Custom Object, once per object above.
   Give each one a Name field of type Text.
2. Add the custom fields exactly as named. Picklist values must match the strings
   in the tables above, including case and spacing (`absolute NNN`, not
   `Absolute NNN`) — the values come straight from the extraction schema.
3. On `Deal_Hash__c`, tick **External ID** and **Unique**.
4. Give the integration user read/write on all four objects and every field.

## Switching Artificer to the real org

Set all three of these and restart; the adapter switches automatically and the
header reads `real salesforce`:

```
SF_LOGIN_URL=https://login.salesforce.com   # or https://test.salesforce.com for a sandbox
SF_USERNAME=integration@example.com
SF_PASSWORD=<password><security token>      # concatenated, no separator
SF_INSTANCE_URL=https://your-domain.my.salesforce.com   # optional, enables link-out
```

A partial configuration deliberately falls back to mock rather than failing at
the moment of approval.
