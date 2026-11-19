# Independent static and simulated QA review

Date: 2026-11-18. Base: author's P02_Full_Project_Deployment_Package.zip (six workflows, six CSV files) plus original portfolio media and the two existing CRM/proposal table templates.

## Scope & reproducibility

| Verification | Result | Evidence |
| --- | ---: | --- |
| Workflows | 6 | `workflows/*.json` |
| Total nodes | 163 | `qa/NODE_QA_MATRIX.csv` |
| Executable nodes exercised in local simulator | 157/157 (100%) | `tests/simulation_results_verified.json` |
| Simulated test scenarios | 39/39 passed | `tests/simulation_results_verified.json` |
| Code nodes | 56 | `qa/static_audit.json` |
| Data Table nodes | 38 | `qa/static_audit.json` |
| Graph edges | 164 | `qa/static_audit.json` |
| Referenced CSV schemas | 8 | `data_tables/` |
| Unresolved node names, invalid mapped CSV fields, JS syntax errors | 0 | `qa/static_audit.json` |
| Live n8n execution / real model providers / finance data | **Not tested** | No access to owner's running instance |

## Confirmed source problems addressed in the corrected exports

1. **Main completion path:** the original Pipeline sub-workflow call was a terminal node; linked success and failure paths back to demo/Form completion. Added a manual demo output summary.
2. **Dangerous write mappings:** removed two literal `=` values from `SaveNewLead.lead_score` and `UpdateLeadQualification.lead_id` that could cause invalid number writes or overwrite the lead reference.
3. **Lost handoff failures:** added a saved-status path for proposal/pipeline handoff errors rather than silently stopping the form flow.
4. **Model response robustness:** Gemini lead JSON parser now tolerates fenced JSON; configured a 2000 ms retry interval. Proposal AI output includes basic HTML tag stripping; complex sanitization remains a production concern.
5. **Approval errors:** an error after sales approval now uses a separate `ShowDocumentDraftFailed` completion message rather than claiming document draft success.
6. **Finance review:** stronger calendar date validation and an evidence-aware retry after partial contract-signature/invoice write failure.
7. **Payment ledger cardinality (critical):** a Get operation can return multiple rows; without a one-item collapse this previously fanned out into repeated eligibility/write operations for a single payment. `CollapsePaymentLedger` ensures one write attempt per input event.
8. **Revenue report cardinality (critical):** `CollapseReportInvoices` and `CollapseReportPayments` prevent repeated Get fan-out and repeated revenue snapshot generation when multiple source rows exist.
9. **Canvas layout:** manually placed added nodes in the corrected workflow exports for clearer inspection and generated updated diagrams.

## Simulator capability

Tests load the actual n8n JSON `jsCode` content and execute it in an isolated JavaScript VM with mocked n8n APIs and an in-memory table ledger. They exercise IF paths, field mappings, nested sub-workflow handoffs, guarded writes, human review decisions and revenue calculations. AI model calls return **synthetic JSON fixtures**, not actual provider inference. HTTP authentication, n8n expression/runtime compatibility, database transaction isolation, API quotas and UI validation are not independently verified.

## Remaining limitations and conditions for production

- The application must be **imported and executed on the owner's n8n installation** before claiming a live end-to-end pass. See `INSTALL_EN.md` for smoke tests.
- Data Table inserts and updates across different tables are not transactions; simultaneous submissions or failures between writes can leave partial state. No strict global uniqueness/concurrency guarantees were proven.
- The finance review form records a human assertion of a signed contract. It does **not** validate the underlying signature or legal terms.
- Manual payment records are not bank/provider reconciliation or money transfers. Real payments require evidence matching and appropriate controls.
- Quote rate card and taxes are non-binding demonstration values, not market prices or tax advice.
- Private n8n-user-authenticated forms must be revalidated after deployment; do not publish internal reviewer/finance/payment URLs.
- Customer PII should not enter public screenshots, code exports, or AI prompts without a privacy review.
- No client ROI, SLA, throughput, or uptime claims have been established.

**QA status: static and simulated validation passed; live staging acceptance remains pending.**
