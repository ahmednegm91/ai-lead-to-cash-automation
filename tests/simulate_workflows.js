'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const ROOT=path.resolve(__dirname,'../workflows');
const files=fs.readdirSync(ROOT).filter(x=>x.endsWith('.json')).sort();
const wf=new Map(),byShort=new Map();
for(const f of files){const d=JSON.parse(fs.readFileSync(path.join(ROOT,f),'utf8'));wf.set(d.name,d);byShort.set(path.basename(f,'.json').split('_')[1],d.name)}
const W=(num)=>wf.get(byShort.get(String(num).padStart(2,'0')));
const db={};const tables=['P02_LeadsCRM','P02_Proposals','P02_Opportunities','P02_ApprovalLog','P02_Contracts','P02_Invoices','P02_Payments','P02_RevenueSnapshots'];
for(const x of tables)db[x]=[];
let ctr=2000,nodeCount=0,workflowRuns=0,modelCalls={gemini:0,groq:0,proposalGemini:0,proposalGroq:0};
let activeScenario={}; const perNodeCoverage=new Map();
const sampleProposal={proposal_title:'Lead Automation Proposal',executive_summary:'Draft implementation scope for client discovery.',proposed_solution:'Connect inbound web leads to the CRM, with routing and follow-up drafts.',deliverables:['Capture incoming leads','Route CRM records','Validate draft follow-ups'],assumptions:['CRM credentials will be provided by client'],exclusions:['Production hosting is outside the draft scope'],timeline_note:'Schedule pending technical discovery.',next_steps:['Confirm systems and client requirements']};
function plain(x){return JSON.parse(JSON.stringify(x));}
function mkitem(x){return x && Object.prototype.hasOwnProperty.call(x,'json') ? x:{json:plain(x)}}
function modelOutput(name,input){
  if(name==='QualifyLeadAI'){
   modelCalls.gemini++;
   if(activeScenario.failGemini)throw new Error('FAKE_GEMINI_OUTAGE');
   return {content:{parts:[{text:JSON.stringify({lead_score:86,ai_summary:'Qualified fictional lead for automation',reasoning:'Relevant scope',suggested_next_action:'Discovery call'})}]}};
  }
  if(name==='GroqBackupAI'){
   modelCalls.groq++;
   if(activeScenario.failGroq)throw new Error('FAKE_GROQ_OUTAGE');
   return {text:JSON.stringify({lead_score:72,ai_summary:'Groq-qualified fictional lead',reasoning:'Clear service fit',suggested_next_action:'Call'})};
  }
  if(name==='GenerateProposalAI'){
   modelCalls.proposalGemini++;
   if(activeScenario.failProposalGemini)throw new Error('FAKE_PROPOSAL_GEMINI_OUTAGE');
   return {text:JSON.stringify(sampleProposal)};
  }
  if(name==='GenerateProposalGroq'){
   modelCalls.proposalGroq++;
   if(activeScenario.failProposalGroq)throw new Error('FAKE_PROPOSAL_GROQ_OUTAGE');
   return {text:JSON.stringify(sampleProposal)};
  }
  throw Error('Unexpected fake model node '+name);
}
function runner(wfname,startName,input={},scenario={}){
  activeScenario=scenario;
  const d=wf.get(wfname);if(!d)throw Error('Workflow not found '+wfname);
  const context={workflow:d,seen:new Set(),outputs:new Map(),events:[],execId:String(++ctr),scenario};
  workflowRuns++;
  function evalJs(src,current){
   if(typeof src!=='string')return src;
   if(src.startsWith('={{')||src.startsWith('=\n{{') || src.startsWith('= {{')){
    let code=src.replace(/^=\s*\{\{/,'').replace(/\}\}\s*$/,'').trim();
    return safeEval(code,current);
   }
   if(src==='=')throw Error('Invalid lone equals expression in '+context.workflow.name);
   return src;
  }
  function getNodeRef(name){return {first:()=>{const o=context.outputs.get(name);if(!o||!o.length)throw Error('Unexecuted node referenced '+name+' in '+d.name);return o[0]},all:()=>context.outputs.get(name)||[], get isExecuted(){return context.seen.has(name)}}}
  function safeEval(code,current){
   let sandbox={$json:current, $:(name)=>getNodeRef(name),$execution:{id:context.execId},Date,JSON,Math,String,Number,Boolean,Array,Object,RegExp,parseInt,parseFloat,encodeURIComponent};
   return vm.runInNewContext('('+code+')',sandbox,{timeout:1000});
  }
  function runCode(n,items){const mode=n.parameters.mode||'runOnceForAllItems';const source=n.parameters.jsCode;
   const run=(it)=>{
    const $json=it?.json??{};
    const sandbox={$json,$:(name)=>getNodeRef(name),$execution:{id:context.execId},$input:{item:it,all:()=>items,first:()=>items[0]},Date,JSON,Math,String,Number,Boolean,Array,Object,RegExp,console};
    const v=vm.runInNewContext('(function(){\n'+source+'\n})()',sandbox,{timeout:1500});
    return Array.isArray(v)?v.map(mkitem):[mkitem(v)];
   };
   if(mode==='runOnceForEachItem')return items.flatMap(run);
   return run(items[0]||{json:{}});
  }
  function handle(n,items){
   nodeCount++;
   if(nodeCount>30000)throw Error('Runaway recursion');
   if(scenario.failNodeNames && scenario.failNodeNames.includes(n.name))throw Error('INJECTED_FAILURE_'+n.name);
   const typ=n.type.split('.').pop(),p=n.parameters||{};
   if(['executeWorkflowTrigger','manualTrigger','formTrigger'].includes(typ))return [items];
   if(typ==='code')return [runCode(n,items)];
   if(typ==='if'){
    const good=[],bad=[];
    for(const it of items){
     let bool=p.conditions.combinator==='or'?false:true;
     for(const cond of p.conditions.conditions){
      const val=evalJs(cond.leftValue,it.json), right=evalJs(cond.rightValue,it.json),op=cond.operator.operation;
      let pass=false;
      if(op==='true')pass=val===true || (p.conditions.options.typeValidation==='loose' && String(val)==='true');
      else if(op==='false')pass=val===false;
      else if(op==='equals')pass=String(val)===String(right);
      else if(op==='notEmpty')pass=val!==null&&val!==undefined&&String(val).length>0;
      else throw Error('Unknown IF operation: '+op+' '+n.name);
      bool=p.conditions.combinator==='or'?bool||pass:bool&&pass;
     }
     (bool?good:bad).push(it);
    }
    return [good,bad];
   }
   if(typ==='dataTable'){
     const tb= p.dataTableId.cachedResultName||p.dataTableId.value;
     if(!db[tb])throw Error('Missing table '+tb+' in '+n.name);
     const rows=db[tb],res=[];const op=p.operation||'insert';
     for(const it of items){
      function match(row){return (p.filters?.conditions||[]).every(f=>String(row[f.keyName]??'')===String(evalJs(f.keyValue,it.json)??''));}
      const found=rows.filter(match);
      if(op==='get'){
        const limit=p.returnAll?Infinity:p.limit??10;
        const hits=found.slice(0,limit).map(row=>({json:plain(row)}));
        res.push(...hits);
        if(hits.length===0 && n.alwaysOutputData)res.push({json:{}});
      }else if(op==='rowNotExists'){
        if(found.length===0)res.push(it);
        else if(n.alwaysOutputData)res.push({json:{}});
      }else if(op==='insert'){
        const values={};for(const [k,v] of Object.entries(p.columns?.value||{}))values[k]=evalJs(v,it.json);
        const newRow={...values,id:'row_'+(++ctr),createdAt:new Date().toISOString()};rows.push(newRow);res.push({json:plain(newRow)});
      }else if(op==='update'){
        const values={};for(const [k,v] of Object.entries(p.columns?.value||{}))values[k]=evalJs(v,it.json);
        for(const row of found){Object.assign(row,values);res.push({json:plain(row)});}
        if(!found.length && n.alwaysOutputData)res.push({json:{}});
      }else throw Error('Unknown dataTable operation '+op);
     }
     return [res];
   }
   if(typ==='executeWorkflow'){
     const target=p.workflowId.cachedResultName;
     if(!target||!wf.has(target))throw Error('Unknown child workflow: '+target);
     const child=wf.get(target);
     const trig=child.nodes.find(x=>x.type==='n8n-nodes-base.executeWorkflowTrigger');
     const result=[];
     for(const it of items){const r=runner(target,trig.name,it.json,scenario);result.push(...r.items.map(mkitem));}
     return [result];
   }
   if(typ==='stopAndError')throw Error(p.errorMessage||'STOP_AND_ERROR');
   if(typ==='form'){
     for(const it of items)context.events.push({kind:'form',node:n.name,title:p.completionTitle,record:it.json});
     return [items];
   }
   if(['googleGemini','chainLlm'].includes(typ))return [items.map(x=>({json:modelOutput(n.name,x.json)}))];
   if(typ==='set'){
     return [items.map(it=>{const j=p.includeOtherFields?plain(it.json):{};for(const a of p.assignments?.assignments||[])j[a.name]=evalJs(a.value,it.json);return {json:j}})];
   }
   if(['stickyNote','lmChatGroq','lmChatGoogleGemini'].includes(typ))return [items];
   throw Error('Unknown node type '+typ+' '+n.name);
  }
  const visitedTrace=[];
  function flow(name,items){
   if(!items||!items.length)return [];
   const n=d.nodes.find(x=>x.name===name);if(!n)throw Error('Missing node '+name);
   context.seen.add(name);
   visitedTrace.push(name);
   const ckey=d.name+"::"+name; perNodeCoverage.set(ckey,(perNodeCoverage.get(ckey)||0)+1);
   let ports;
   try{ports=handle(n,items);}
   catch(err){
    if(n.onError==='continueErrorOutput')ports=[[],[{json:{error:err.message,message:err.message}}]];
    else {err.message='['+d.name+'::'+name+'] '+err.message;throw err;}
   }
   const all=ports.flat();
   context.outputs.set(name,all);
   const outgoing=d.connections?.[name]?.main||[];
   const collected=[];
   for(let port=0;port<ports.length;port++){
    const arr=ports[port];if(!arr.length)continue;
    const tos=outgoing[port]||[];
    if(!tos.length){collected.push(...arr);context.events.push({kind:'terminal',node:name,port,items:arr.length});}
    for(const to of tos)collected.push(...flow(to.node,arr));
   }
   return collected;
  }
  const initial=Array.isArray(input)?input.map(mkitem):[mkitem(input)];
  const final=flow(startName,initial);
  return {items:final.map(x=>plain(x.json)),events:context.events,trace:visitedTrace,outputs:context.outputs};
}
let ok=0;const outcomes=[];
function test(title,fn){try{fn();ok++;outcomes.push('PASS '+title);}catch(e){outcomes.push('FAIL '+title+': '+e.stack);console.error(outcomes.at(-1));process.exitCode=1;}}
function mainSample(email){return {full_name:'Fictional Client',email,company:'Fictional Industries',service_needed:'AI Automation',project_description:'A fictional client wants to automate lead capture, CRM updates, quotation drafting, and manual approvals.',budget_range:'Over $2,000',desired_timeline:'ASAP'};}
const today=new Date().toISOString().slice(0,10);
const future=new Date(Date.now()+14*86400000).toISOString().slice(0,10);
const counters=()=>Object.fromEntries(Object.entries(db).map(([k,v])=>[k,v.length]));
let quote1,lead1,invoice1,quote2,lead2,invoice2;
test('all six JSON loaded and unique names',()=>{assert.equal(wf.size,6);for(const d of wf.values()){const names=d.nodes.map(x=>x.name);assert.equal(new Set(names).size,names.length);}});
test('main manual demo reaches client-safe summary and creates draft opportunity',()=>{
 const r=runner(W(3).name,'ManualDemoTest');
 assert(r.trace.includes('ReturnDemoResult'),'manual return node missing');
 assert(!r.trace.includes('ShowLeadResult'),'manual form should not execute');
 assert.equal(r.items.at(-1).status,'demo_completed');
 assert.equal(db.P02_LeadsCRM.length,1);assert.equal(db.P02_Proposals.length,1);assert.equal(db.P02_Opportunities.length,1);
 quote1=db.P02_Proposals[0].quote_id;lead1=db.P02_LeadsCRM[0].lead_id;
 assert.equal(db.P02_LeadsCRM[0].lead_id,lead1);assert(db.P02_LeadsCRM[0].lead_score>0);
});
test('normal web form finishes with a form response',()=>{
 const r=runner(W(3).name,'GetLead',mainSample('webfresh@example.com'));
 assert(r.trace.includes('ShowLeadResult'));assert(r.trace.includes('CallSalesProposal'));
 assert(!r.trace.includes('ReturnDemoResult'));
 quote2=db.P02_Proposals.at(-1).quote_id;lead2=db.P02_LeadsCRM.at(-1).lead_id;
});
test('duplicate web lead is blocked without creating new lead',()=>{
 const n=db.P02_LeadsCRM.length;
 const r=runner(W(3).name,'GetLead',mainSample('webfresh@example.com'));
 assert(r.trace.includes('ShowDuplicateLeadResult'));assert.equal(db.P02_LeadsCRM.length,n);
});
test('invalid email triggers invalid response',()=>{
 const n=db.P02_LeadsCRM.length;
 const r=runner(W(3).name,'GetLead',mainSample('not-an-email'));
 assert(r.trace.includes('ShowInvalidLeadResult'));assert.equal(db.P02_LeadsCRM.length,n);
});
test('AI Gemini outage calls Groq and returns qualification',()=>{
 const r=runner(W(3).name,'GetLead',mainSample('groq@fictional.example'),{failGemini:true});
 assert(r.trace.includes('ShowLeadResult'));assert(db.P02_LeadsCRM.some(x=>x.email==='groq@fictional.example'&&x.lead_score===72));
});
test('both lead models failing records qualification_failed and responds',()=>{
 const r=runner(W(3).name,'GetLead',mainSample('bothfail@fictional.example'),{failGemini:true,failGroq:true});
 assert(r.trace.includes('Form'));assert(db.P02_LeadsCRM.some(x=>x.email==='bothfail@fictional.example'&&x.lead_status==='qualification_failed'));
});
test('both proposal models failing uses safe template and still creates draft',()=>{
 const n=db.P02_Proposals.length;
 const r=runner(W(3).name,'GetLead',mainSample('template@fictional.example'),{failProposalGemini:true,failProposalGroq:true});
 assert.equal(db.P02_Proposals.length,n+1);
 assert.equal(db.P02_Proposals.at(-1).ai_provider,'template_fallback');
});
test('proposal persistence failure is surfaced to CRM instead of stalling',()=>{
 const r=runner(W(3).name,'GetLead',mainSample('failprop@fictional.example'),{failNodeNames:['SaveProposalDraft']});
 assert(r.trace.includes('MarkProposalNeedsReview'));
 assert(r.trace.includes('ShowLeadResult'));
 assert.equal(db.P02_LeadsCRM.at(-1).lead_status,'proposal_needs_review');
});
test('pipeline handoff failure is surfaced to CRM and web form still completes',()=>{
 const r=runner(W(3).name,'GetLead',mainSample('failpipe@fictional.example'),{failNodeNames:['SaveNewOpportunity']});
 assert(r.trace.includes('MarkPipelineHandoffFailed'));assert(r.trace.includes('ShowLeadResult'));
 assert.equal(db.P02_LeadsCRM.at(-1).lead_status,'pipeline_handoff_failed');
});
test('review invalid quote returns blocked result',()=>{
 const before=db.P02_ApprovalLog.length;
 const r=runner(W(4).name,'ReviewProposalForm',{quote_id:'BAD-REF',approval_decision:'approve',pricing_confirmed:'Yes',reviewer:'Reviewer QA',review_notes:'Approved pending finance'});
 assert(r.trace.includes('ShowReviewBlocked'));assert.equal(db.P02_ApprovalLog.length,before);
});
test('sales approval updates proposal/opportunity and generates draft documents',()=>{
 const r=runner(W(4).name,'ReviewProposalForm',{quote_id:quote1,approval_decision:'approve',pricing_confirmed:'Yes',reviewer:'QA Reviewer',review_notes:'Pricing and scope checked'});
 assert(r.trace.includes('ShowReviewSaved'));assert.equal(db.P02_Proposals.find(x=>x.quote_id===quote1).approval_status,'approved');
 assert.equal(db.P02_Opportunities.find(x=>x.quote_id===quote1).approval_status,'approved');
 assert.equal(db.P02_ApprovalLog.length,1);
 assert.equal(db.P02_Contracts.length,1);assert.equal(db.P02_Invoices.length,1);
 invoice1=db.P02_Invoices.find(x=>x.quote_id===quote1).invoice_id;
});
test('duplicate sales review is refused and audit log is unchanged',()=>{
 const n=db.P02_ApprovalLog.length;
 const r=runner(W(4).name,'ReviewProposalForm',{quote_id:quote1,approval_decision:'approve',pricing_confirmed:'Yes',reviewer:'QA Reviewer',review_notes:'Duplicate approval attempt'});
 assert(r.trace.includes('ShowReviewBlocked'));assert.equal(db.P02_ApprovalLog.length,n);
});
test('document module idempotently returns an existing invoice',()=>{
 const n=db.P02_Invoices.length;
 const r=runner(W(5).name,'DocumentInput',{quote_id:quote1});
 assert.equal(r.items.at(-1).status,'already_exists');assert.equal(db.P02_Invoices.length,n);
});
test('unapproved proposal blocked from contract/invoice drafting',()=>{
 const n=db.P02_Invoices.length;
 const r=runner(W(5).name,'DocumentInput',{quote_id:quote2});
 assert.equal(r.items.at(-1).status,'blocked');assert.equal(db.P02_Invoices.length,n);
});
test('invalid finance date is blocked',()=>{
 const r=runner(W(5).name,'FinanceReleaseForm',{invoice_id:invoice1,reviewer:'QA Finance',signature_evidence_ref:'TEST-SIGNED-REF-001',signature_verified:'Yes',tax_usd:50,due_date:'2026-02-30'});
 assert(r.trace.includes('ShowFinanceBlocked'));assert.equal(db.P02_Invoices.find(x=>x.invoice_id===invoice1).invoice_status,'draft_pending_review');
});
test('invoice update failure after signature allows safe finance retry',()=>{
 let errored=false;try{runner(W(5).name,'FinanceReleaseForm',{invoice_id:invoice1,reviewer:'QA Finance',signature_evidence_ref:'TEST-SIGNED-REF-001',signature_verified:'Yes',tax_usd:50,due_date:future},{failNodeNames:['ReleaseInvoice']});}catch(e){errored=true;}
 assert(errored);
 assert.equal(db.P02_Contracts.find(x=>x.quote_id===quote1).contract_status,'signature_verified_by_reviewer');
 const r=runner(W(5).name,'FinanceReleaseForm',{invoice_id:invoice1,reviewer:'QA Finance',signature_evidence_ref:'TEST-SIGNED-REF-001',signature_verified:'Yes',tax_usd:50,due_date:future});
 assert(r.trace.includes('ShowInvoiceReleased'));
 assert.equal(db.P02_Invoices.find(x=>x.invoice_id===invoice1).invoice_status,'issued');
});
test('partial payment records once, even if invoice has prior ledger rows',()=>{
 const r=runner(W(6).name,'PaymentInput',{invoice_id:invoice1,payment_reference:'WIRE-001',payment_method:'Bank Transfer',amount_usd:100,recorded_by:'QA Accountant',paid_at:today});
 assert.equal(r.items.at(-1).status,'payment_recorded');assert.equal(db.P02_Payments.length,1);
 const r2=runner(W(6).name,'PaymentInput',{invoice_id:invoice1,payment_reference:'WIRE-002',payment_method:'Bank Transfer',amount_usd:150,recorded_by:'QA Accountant',paid_at:today});
 assert.equal(r2.items.length,1);assert.equal(db.P02_Payments.length,2);assert.equal(db.P02_Invoices.find(x=>x.invoice_id===invoice1).paid_amount_usd,250);
});
test('duplicate payment is rejected without ledger write',()=>{
 const n=db.P02_Payments.length;
 const r=runner(W(6).name,'PaymentInput',{invoice_id:invoice1,payment_reference:'WIRE-001',payment_method:'Bank Transfer',amount_usd:40,recorded_by:'QA Accountant',paid_at:today});
 assert.equal(r.items.at(-1).status,'payment_rejected');assert.equal(db.P02_Payments.length,n);
});
test('overpayment is rejected and balance does not change',()=>{
 const n=db.P02_Payments.length;
 const r=runner(W(6).name,'PaymentInput',{invoice_id:invoice1,payment_reference:'WIRE-NEW-OVER',payment_method:'Bank Transfer',amount_usd:5000,recorded_by:'QA Accountant',paid_at:today});
 assert.equal(r.items.at(-1).status,'payment_rejected');assert.equal(db.P02_Payments.length,n);
});
test('second invoice sales approval and finance release',()=>{
 runner(W(4).name,'ReviewProposalForm',{quote_id:quote2,approval_decision:'approve',pricing_confirmed:'Yes',reviewer:'QA Reviewer',review_notes:'Approved'});
 invoice2=db.P02_Invoices.find(x=>x.quote_id===quote2).invoice_id;
 runner(W(5).name,'FinanceReleaseForm',{invoice_id:invoice2,reviewer:'QA Finance',signature_evidence_ref:'TEST-SIGNED-REF-002',signature_verified:'Yes',tax_usd:0,due_date:future});
 assert.equal(db.P02_Invoices.filter(x=>x.invoice_status==='issued'||x.invoice_status==='partially_paid').length,2);
});
test('report aggregates multiple invoices and ledger rows exactly once',()=>{
 const n=db.P02_RevenueSnapshots.length;
 const r=runner(W(6).name,'Manual Revenue Report',{});
 assert.equal(db.P02_RevenueSnapshots.length,n+1);
 const report=r.items.at(-1);
 assert.equal(report.issued_invoices,2);assert.equal(report.payment_count,2);
 const allDue=db.P02_Invoices.reduce((s,x)=>s+Number(x.total_due_usd||0),0);
 assert(Math.abs(report.total_invoiced_usd-allDue)<0.001);
 assert.equal(report.total_collected_usd,250);
 assert.equal(report.discrepancies_json,'[]');
});
test('dashboard private form reports one snapshot and finishes',()=>{
 const n=db.P02_RevenueSnapshots.length;
 const r=runner(W(6).name,'RevenueDashboardForm',{report_scope:'All issued invoices'});
 assert.equal(db.P02_RevenueSnapshots.length,n+1);assert(r.trace.includes('ShowRevenueDashboard'));
});
test('payment invalid date rejected before any table write',()=>{
 const n=db.P02_Payments.length;
 const r=runner(W(6).name,'PaymentInput',{invoice_id:invoice1,payment_reference:'BAD-DATE',amount_usd:1,recorded_by:'QA Accountant',paid_at:'2026-02-30'});
 assert.equal(r.items.at(-1).status,'payment_rejected');assert.equal(db.P02_Payments.length,n);
});

test('proposal missing fields returns a controlled result without persistence',()=>{
 const n=db.P02_Proposals.length;
 const r=runner(W(2).name,'ProposalInput',{lead_id:'LEAD-INVALID',company:'Test Co',service_needed:'AI Automation',project_description:'short'});
 assert.equal(r.items.at(-1).status,'missing_input'); assert.equal(db.P02_Proposals.length,n);
});
test('standalone proposal manual preview generates one draft with no client notification',()=>{
 const n=db.P02_Proposals.length;
 const r=runner(W(2).name,'Manual Demo Test',{});
 assert(r.trace.includes('ReturnProposalResult'));assert.equal(db.P02_Proposals.length,n+1);
});
test('standalone pipeline manual demo only previews and does not write',()=>{
 const n=db.P02_Opportunities.length;
 const r=runner(W(4).name,'Manual Demo Test',{});
 assert.equal(r.items.at(-1).demo_only,true);assert.equal(db.P02_Opportunities.length,n);
});
test('invalid opportunity reference returns a structured blocked response',()=>{
 const r=runner(W(4).name,'OpportunityInput',{quote_id:'',lead_id:''});
 assert.equal(r.items.at(-1).status,'blocked');
});
test('proposal missing in pipeline blocks opportunity creation',()=>{
 const n=db.P02_Opportunities.length;
 const r=runner(W(4).name,'OpportunityInput',{quote_id:'P02-Q-UNKNOWN-1000',lead_id:'LEAD-GHOST-1'});
 assert.equal(r.items.at(-1).status,'blocked');assert.equal(db.P02_Opportunities.length,n);
});
test('existing pending opportunity is returned without an insert',()=>{
 const prop=db.P02_Proposals.find(p=>p.approval_status==='pending_review'&&db.P02_Opportunities.some(o=>o.quote_id===p.quote_id));
 assert(prop,'pending opportunity fixture missing');
 const n=db.P02_Opportunities.length;
 const r=runner(W(4).name,'OpportunityInput',{quote_id:prop.quote_id,lead_id:prop.lead_id});
 assert.equal(r.items.at(-1).status,'already_exists');assert.equal(db.P02_Opportunities.length,n);
});
test('rejecting a proposal records the decision but does not create invoice drafts',()=>{
 const prop=db.P02_Proposals.find(p=>p.approval_status==='pending_review'&&db.P02_Opportunities.some(o=>o.quote_id===p.quote_id));
 assert(prop);
 const n=db.P02_Contracts.length;
 const r=runner(W(4).name,'ReviewProposalForm',{quote_id:prop.quote_id,approval_decision:'reject',pricing_confirmed:'No',reviewer:'QA Reviewer',review_notes:'Scope not yet agreed; request more details'});
 assert(r.trace.includes('ShowReviewSaved'));
 assert(!r.trace.includes("Call 'P02 | Contract & Invoice Automation'"));
 assert.equal(db.P02_Proposals.find(p=>p.quote_id===prop.quote_id).approval_status,'rejected');
 assert.equal(db.P02_Contracts.length,n);
});
test('standalone contract manual demo generates an unsigned preview only',()=>{
 const n=db.P02_Contracts.length;
 const r=runner(W(5).name,'Manual Demo Test',{});
 assert.equal(r.items.at(-1).demo_only,true);assert.equal(db.P02_Contracts.length,n);
});
test('invalid document request returns blocked instead of writing',()=>{
 const n=db.P02_Contracts.length;
 const r=runner(W(5).name,'DocumentInput',{quote_id:'BAD'});
 assert.equal(r.items.at(-1).status,'blocked');assert.equal(db.P02_Contracts.length,n);
});
test('partial contract creation is detected for manual reconciliation',()=>{
 const lead=mainSample('partialdoc@fictional.example');runner(W(3).name,'GetLead',lead);
 const prop=db.P02_Proposals.at(-1);
 const before=db.P02_Contracts.length;
 const r=runner(W(4).name,'ReviewProposalForm',{quote_id:prop.quote_id,approval_decision:'approve',pricing_confirmed:'Yes',reviewer:'QA Reviewer',review_notes:'Approved'}, {failNodeNames:['SaveInvoiceDraft']});
 assert(r.trace.includes('ShowDocumentDraftFailed'));
 assert.equal(db.P02_Contracts.length,before+1);
 assert(!db.P02_Invoices.some(i=>i.quote_id===prop.quote_id));
 const retry=runner(W(5).name,'DocumentInput',{quote_id:prop.quote_id});
 assert.equal(retry.items.at(-1).status,'manual_reconciliation_required');
});
test('approved invoice cannot be issued twice',()=>{
 const r=runner(W(5).name,'FinanceReleaseForm',{invoice_id:invoice1,reviewer:'QA Finance',signature_evidence_ref:'TEST-SIGNED-REF-001',signature_verified:'Yes',tax_usd:50,due_date:future});
 assert(r.trace.includes('ShowFinanceBlocked'));
});
test('full payment closes invoice and updates CRM exactly once',()=>{
 const i=db.P02_Invoices.find(x=>x.invoice_id===invoice1);const remain=Math.round((i.total_due_usd-i.paid_amount_usd)*100)/100;
 const n=db.P02_Payments.length;
 const r=runner(W(6).name,'PaymentInput',{invoice_id:invoice1,payment_reference:'WIRE-FINAL',amount_usd:remain,recorded_by:'QA Accountant',payment_method:'Bank Transfer',paid_at:today});
 assert.equal(r.items.at(-1).invoice_status,'paid');assert.equal(db.P02_Payments.length,n+1);
 assert.equal(db.P02_LeadsCRM.find(x=>x.lead_id===lead1).lead_status,'paid_recorded');
});
test('n8n-user-authenticated payment form finishes with confirmation',()=>{
 const n=db.P02_Payments.length;
 const r=runner(W(6).name,'RecordPaymentForm',{invoice_id:invoice2,payment_reference:'WIRE-FORM',amount_usd:20,recorded_by:'QA Accountant',payment_method:'Bank Transfer',paid_at:today});
 assert(r.trace.includes('ShowPaymentEntryResult'));assert.equal(db.P02_Payments.length,n+1);
});
test('revenue report remains one snapshot after invoice is fully paid',()=>{
 const n=db.P02_RevenueSnapshots.length;
 const r=runner(W(6).name,'Manual Revenue Report',{});
 assert.equal(db.P02_RevenueSnapshots.length,n+1); assert.equal(r.items.at(-1).payment_count,4);
});

test('proposal Gemini failure uses Groq parser and persists a draft',()=>{
 const n=db.P02_Proposals.length;
 const r=runner(W(3).name,'GetLead',mainSample('proposal-groq@fictional.example'),{failProposalGemini:true});
 assert(r.trace.includes('ShowLeadResult'));
 assert.equal(db.P02_Proposals.length,n+1);
 assert.equal(db.P02_Proposals.at(-1).ai_provider,'groq');
});

const allNodeKeys=[...wf.values()].flatMap(d=>d.nodes.filter(n=>n.type!=="n8n-nodes-base.stickyNote" && !n.type.endsWith("lmChatGroq") && !n.type.endsWith("lmChatGoogleGemini")).map(n=>d.name+"::"+n.name));
const uncovered=allNodeKeys.filter(k=>!perNodeCoverage.has(k));
const result={visitedNodes:allNodeKeys.length-uncovered.length,executableNodes:allNodeKeys.length,uncovered,coverageRatio:Number(((allNodeKeys.length-uncovered.length)*100/allNodeKeys.length).toFixed(2)),passed:ok,total:outcomes.length,workflowRuns,nodeExecutions:nodeCount,modelCalls,tableCounts:counters(),outcomes};
fs.writeFileSync(path.join(__dirname,'latest_simulation_results.json'),JSON.stringify(result,null,2));
console.log('\nRESULT '+JSON.stringify({...result,outcomes:undefined},null,2));
