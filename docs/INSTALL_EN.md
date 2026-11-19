# n8n install, reconnection and acceptance checklist

## 1. Import data tables

Import all eight CSV files from `data_tables/` into the SAME n8n project. Each table must have the exact filename stem as the name. Delete the `SAMPLE_DELETE_ME` row from each table immediately afterward. Confirm numeric columns are parsed as Number, especially `lead_score`, `indicative_subtotal_usd`, `estimated_value_usd`, `service_fee_usd`, `subtotal_usd`, `tax_usd`, `total_due_usd`, `paid_amount_usd`, and report totals/counts.

## 2. Import six workflows

Import modules **01, 02, 04, 05, 06, then 03 (Main)** from `workflows/` while leaving them inactive. The public exports deliberately have no installation-specific workflow ID. Keep the main production Form unpublished during initial checks.

## 3. Reconnect and verify

- Reconnect Gemini and Groq credentials in modules 01 and 02. Never embed actual API keys into Code nodes or GitHub files.
- Open every **Execute Sub-workflow** node in modules 03 and 04 and select the correct imported child from the workflow picker. The public export intentionally clears the old workflow ID.
- Check Data Table names in all nodes and remap them if your n8n version does not resolve a table by name.
- Verify internal forms `ReviewProposalForm`, `FinanceReleaseForm`, `RecordPaymentForm` and `RevenueDashboardForm` require authenticated n8n users with the intended permissions. Do not publish these four URLs.
- Check form / webhook URLs are regenerated and no old URL was copied into the new instance.

## 4. Live end-to-end demo (fictional data only)

1. Execute `ManualDemoTest` in **Module 03**. Check a new synthetic Lead in `P02_LeadsCRM` and draft in `P02_Proposals`; a high-priority test should also create one Opportunity in `P02_Opportunities`.
2. Confirm Module 03 reaches `ReturnDemoResult`; a submission from `GetLead` should reach a Form Ending (`ShowLeadResult`, invalid, duplicate or AI error).
3. From the authenticated `ReviewProposalForm` in **Module 04**, approve a newly created quote after checking the **illustrative demo price**. Expect one audit log event and one draft contract/invoice pair in Module 05.
4. From authenticated `FinanceReleaseForm` in **Module 05**, supply **fictional/demo** contract reference, a valid tax amount, and due date. Expect invoice status `issued`. This is NOT real verification or real issuance.
5. Use authenticated `RecordPaymentForm` in **Module 06** to record two fictional partial payments; verify invoice balance and one Payment row per reference. Try a duplicate reference and overpayment: both should be rejected.
6. Run `Manual Revenue Report` and review issued/collected/outstanding totals and the dashboard.
7. Repeat with invalid lead/email, an existing email, a rejected proposal, an invalid quote reference, a failed Gemini call with working Groq, both LLMs failing, and a missing finance approval.

## 5. Acceptance criteria

- Every form returns a completion screen; the manual demo returns a structured summary.
- Neither high-priority leads nor sub-workflow errors terminate without an observable outcome.
- No duplicate Payment records appear when an invoice already has multiple ledger entries.
- The revenue report produces ONE snapshot per request, even with multiple invoices and payments.
- All internal document/finance/payment steps remain human-controlled. No automatic email sending or real money movement.

## 6. Production migration warnings

This release is a demo blueprint, not a production-ready fintech/business accounting product. Before client rollout, implement tested authentication, audit/approval roles, transactional/idempotent write strategy, data retention/security policy, verified receipt matching, compliance-approved tax and contract content, rate limiting and monitored hosting.

Official n8n references: https://docs.n8n.io/ ; https://docs.n8n.io/flow-logic/error-handling/ ; https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.executeworkflow/
