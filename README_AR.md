# P02 | AI Revenue Operations & Lead-to-Cash Automation

**Ahmed Negm | AI Automation Portfolio | 18 November 2026**

## المشروع باختصار

نموذج عملي (Portfolio Demo) على **n8n Self-Hosted** يوضح رحلة: استقبال Lead، تأهيله بالـAI، تجهيز Proposal وQuotation تجريبي، متابعة الفرصة وموافقة بشرية، تجهيز عقد وفاتورة، وتسجيل دفعات وتقارير الإيرادات.

**دي نسخة Demo فقط وليست نظام Production أو محاسبة فعلي.** الأسعار والضرائب تجريبية، والتوقيعات والمدفوعات تحتاج مراجعة بشرية؛ مفيش خصم أو تحصيل أموال حقيقي، ولا تأكيد بنكي أو توقيع إلكتروني موثّق.

## محتويات الملف

- `workflows/`: ستة Workflows بصيغة JSON منقّحة للنشر. **Active = false** مع إزالة Credential bindings والمعرّفات الخاصة بالبيئة؛ لازم تعيد ربط النماذج والـSub-workflows بعد الاستيراد.
- `data_tables/`: 8 جداول CSV، منها LeadsCRM وProposals والـ6 جداول للمراحل 4–6. احذف صفوف `SAMPLE_DELETE_ME` بعد الاستيراد.
- `screenshots_original/`: الصور الثمانية الأصلية من n8n المرسلة مع المشروع.
- `workflow_diagrams_updated/`: مخططات توضيحية مولّدة من الـJSON، **مش Screenshots حقيقية**.
- `video_demo/`: فيديو MP4 مدته 67 ثانية بدقة Full HD، وصورة غلاف، وملف SRT بالإنجليزي.
- `docs/`: دليل، ملخص إنجليزي، تقرير مراجعة، ووثائق الوحدات السابقة.

## قائمة الـWorkflows

1. `P02 | AI Lead Qualification Engine`، Gemini + Groq fallback.
2. `P02 | Sales Proposal & Quotation`، مسودات عروض وأسعار إرشادية.
3. `P02 | AI Lead-to-Cash Automation`، الـMain: Form، CRM، Demo Trigger والربط.
4. `P02 | Sales Pipeline & Approvals - Final`، Opportunity + مراجعة بشرية.
5. `P02 | Contract & Invoice Automation`، عقد وفاتورة مع Finance Release.
6. `P02 | Payment Tracking & Revenue Intelligence`، سجل دفعات وتقارير وDashboard.

## خطوات إعادة التشغيل على n8n جديد

1. استورد CSV الثمانية كـData Tables بالأسماء المطابقة تمامًا، واتأكد من الأعمدة الرقمية. بعد الاستيراد امسح صفوف `SAMPLE_DELETE_ME`.
2. استورد الـWorkflows 01 و02 و04 و05 و06، وبعدها 03 (Main)؛ **خلي الـWorkflows غير مفعلة أثناء الاختبار**.
3. أعد ربط Google Gemini وGroq Credentials، ثم راجع كل عقدة `Execute Sub-workflow` واختر اسم الـWorkflow الصحيح من القائمة. بعض مراجع الجداول حُولت للاختيار بالاسم لإزالة IDs القديمة.
4. جرّب Demo Trigger داخل الـMain، واتأكد من وصول Lead إلى `P02_LeadsCRM`، وProposal إلى `P02_Proposals`، ثم Opportunity إلى `P02_Opportunities` إذا المسار استدعاها.
5. جرّب Review Form للموافقة، وتحقق من `P02_ApprovalLog`، ثم Contract/Invoice Drafts، ثم Finance Release Form، وبعدها إدخال دفعات وهمية وتقرير الإيرادات.
6. اختبر فشل الموديل الأساسي، وفشل الاثنين، Duplicate Lead/Quote/Payment، عدم الموافقة، وعدم قبول دفع زائد.

## شروط النشر للـPortfolio

ممكن تعرض الصور والفيديو ونسخ الـJSON المنقّحة مع توضيح إنها Demo. متعرضش API Keys أو بيانات عملاء حقيقيين أو ملفات JSON أصلية تحتوي Account IDs/Webhook URLs. وراجع صلاحيات نماذج الموافقة قبل نشر أي رابط للجمهور.

## QA update (18 Nov 2026)

**163 nodes / 6 workflows / 8 Data Tables.** 39 out of 39 **simulated** scenarios passed, including provider fallback, review approvals, finance retry, duplicate payment prevention and revenue reports. 157 of 157 executable nodes were visited in the local simulator. This does **not** replace real testing in your running n8n instance. Details: `docs/QA_REPORT.md`.

The source Main completion path and invoice/payment multi-row processing have been corrected in the JSON exports. For public sharing use this release only; local account references must not be published.
