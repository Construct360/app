/* Branded, immutable inspection record export, not a competence certificate. */
async function buildScaffoldPdf(report,company){
 const [logo,font]=await staffPdfResources(),pdf=new window.jspdf.jsPDF({unit:'mm',format:'a4',compress:true});
 pdf.addFileToVFS('NotoSans-Regular.ttf',base64Bytes(font));pdf.addFont('NotoSans-Regular.ttf','NotoSans','normal');pdf.setFont('NotoSans');
 let y=0;const navy=[8,40,76],muted=[75,95,115],snapshot=report.scaffold_snapshot;
 function header(){pdf.setFillColor(...navy);pdf.rect(0,0,210,8,'F');pdf.addImage(logo,'PNG',16,16,76,16.7);pdf.setDrawColor(246,104,10);pdf.setLineWidth(0.6);pdf.line(16,40,194,40);y=51}
 function room(height){if(y+height>272){pdf.addPage();header()}}
 function text(value,size=10,color=navy){pdf.setFontSize(size);pdf.setTextColor(...color);for(const line of pdf.splitTextToSize(String(value??'').replace(/[\u2010-\u2015]/g,'-'),178)){room(size*0.45+2);pdf.text(line,16,y);y+=size*0.45+2}}
 function section(title,value){room(24);y+=4;text(title,12);text(value,10,muted)}
 header();text('SCAFFOLD INSPECTION REPORT',18);text(company,12);text('Report ID: '+report.id,8,muted);
 text(report.outcome==='unsafe'?'DO NOT USE - UNSAFE / ACTION REQUIRED':'SATISFACTORY AT TIME OF INSPECTION (REPORTED)',12,report.outcome==='unsafe'?[145,39,28]:navy);
 section('Qualification warning',report.inspector_scope);
 text('This report is not verification of inspector competence or a guarantee of current site safety.',9,muted);
 section('Job / site',snapshot.job_code+' - '+snapshot.job_site);
 section('Scaffold',snapshot.reference+'\nLocation: '+snapshot.location+'\nDescription: '+snapshot.description);
 section('Inspection carried out for (name and address)',report.inspection_for);
 section('Inspection details','Inspected: '+vehicleTime(report.inspected_at)+' (UK time)\nRecorded: '+vehicleTime(report.recorded_at)+' (UK time)\nReason: '+report.reason+'\nInspector: '+report.inspector_name+'\nPosition: '+report.inspector_position);
 section('Inspection checklist',Object.entries(SCAFFOLD_CHECKS).map(([key,label])=>label+': '+({pass:'Satisfactory',fail:'Defect / unsatisfactory',na:'Not applicable'}[report.checks[key]]||report.checks[key])).join('\n'));
 section('Defects / matters that may create a safety risk',report.findings);
 section('Action taken, including immediate notifications',report.action_taken);
 section('Further action required',report.further_action);
 section('Recorded declaration','The submitting user confirmed they are competent for this scaffold and that the completed inspection report is accurate. The application has not verified their qualifications.');
 section('Next inspection',report.outcome==='unsafe'?'Do not use. Further action and a satisfactory reinspection are required.':'Seven-day deadline from this inspection: '+vehicleTime(new Date(new Date(report.inspected_at).getTime()+168*3600000).toISOString())+' (UK time). Inspect sooner after events affecting safety. Check the live scaffold record for subsequent reports, warnings or dismantling.');
 text('Retain this report and provide it to the responsible person. Downloading does not send it automatically.',9,muted);
 for(let i=1;i<=pdf.getNumberOfPages();i++){pdf.setPage(i);pdf.setDrawColor(220,228,235);pdf.line(16,281,194,281);pdf.setFontSize(8);pdf.setTextColor(...muted);pdf.text('Construct-360 | Scaffold inspection | Company record',16,288);pdf.text(i+' / '+pdf.getNumberOfPages(),194,288,{align:'right'})}
 return pdf.output('blob');
}
