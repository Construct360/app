/* Branded reports generated from a fresh, role-filtered server snapshot. */
async function buildTimesheetPdf(sheets,company,week,includePay=false,summary=false){
 if(!window.jspdf?.jsPDF)throw new Error('PDF tools could not load. Refresh and try again.');
 const [logo,font]=await staffPdfResources(),pdf=new window.jspdf.jsPDF({unit:'mm',format:'a4',compress:true});
 pdf.addFileToVFS('NotoSans-Regular.ttf',base64Bytes(font));pdf.addFont('NotoSans-Regular.ttf','NotoSans','normal');pdf.setFont('NotoSans');
 const navy=[8,40,76],orange=[246,104,10],grey=[86,105,125];let y=0;
 const clean=value=>String(value??'').replace(/[\u2010-\u2015]/g,'-');
 function header(){pdf.setFillColor(...navy);pdf.rect(0,0,210,8,'F');pdf.addImage(logo,'PNG',16,16,76,16.7);pdf.setDrawColor(...orange);pdf.setLineWidth(0.8);pdf.line(16,40,194,40);y=51}
 function space(height){if(y+height>272){pdf.addPage();header()}}
 function text(value,size=10,color=navy){pdf.setFontSize(size);pdf.setTextColor(...color);for(const line of pdf.splitTextToSize(clean(value),178)){space(size*0.45+2);pdf.text(line,16,y);y+=size*0.45+2}}
 function rule(){space(6);pdf.setDrawColor(220,228,235);pdf.line(16,y,194,y);y+=5}
 header();text(summary?'WEEKLY TIMESHEET REPORT':'WEEKLY TIMESHEET',18);text(company,12);text(`Week: ${dateLabel(week)} to ${dateLabel(addDays(week,6))}`,10,grey);text('Generated: '+vehicleTime(new Date().toISOString())+' (UK time)',9,grey);y+=5;
 if(includePay)text('Base-pay estimates only: hours x hourly rate. No overtime uplift, deductions, tax or employer costs included. Approved rates are fixed at approval; other rates are provisional.',9,grey);
 else text('Hours-only report. Saved records only; unsaved changes are not included.',9,grey);
 if(summary){
  const approved=sheets.filter(s=>s.status==='approved');
  text(`Timesheets: ${sheets.length} | Saved hours: ${timesheetHours(sheets.reduce((n,s)=>n+Number(s.total_hours),0))}`,11);
  if(includePay)text(`Approved hours: ${timesheetHours(approved.reduce((n,s)=>n+Number(s.total_hours),0))} | Approved base-pay estimate: ${timesheetMoney(approved.reduce((n,s)=>n+Number(s.gross_estimate||0),0))}`,11);
  if(!sheets.length)text('No timesheets saved for this week.',11);
  for(const sheet of sheets){space(45);rule();text(sheet.staff_name,13);text(timesheetStatus(sheet.status),10);text(`${timesheetHours(sheet.total_hours)} hours`,11);
   if(includePay)text(`Rate: ${timesheetMoney(sheet.hourly_rate)} / hour | Base-pay estimate: ${timesheetMoney(sheet.gross_estimate)}${sheet.status==='approved'?' (approved)':' (provisional)'}`,10);
   if(sheet.approved_at)text('Approved: '+vehicleTime(sheet.approved_at),9,grey);
  }
 }else{
  for(const sheet of sheets){space(38);rule();text(sheet.staff_name,15);text('Status: '+timesheetStatus(sheet.status),11);text('Total worked: '+timesheetHours(sheet.total_hours)+' hours',12);
   if(includePay)text(`Hourly rate: ${timesheetMoney(sheet.hourly_rate)} | Base-pay estimate: ${timesheetMoney(sheet.gross_estimate)}`,11);
   if(sheet.submitted_at)text('Submitted: '+vehicleTime(sheet.submitted_at),9,grey);
   if(sheet.approved_at)text('Approved: '+vehicleTime(sheet.approved_at),9,grey);
   if(sheet.review_note)text('Office note: '+sheet.review_note,10);
   for(let i=0;i<7;i++){const day=addDays(week,i),entries=sheet.entries.filter(e=>e.date===day),total=entries.reduce((n,e)=>n+Number(e.hours),0);
    if(!entries.length){space(15);rule();text(`${dateLabel(day)} - 0 hours (no hours recorded)`,10,grey);continue}
    space(21);rule();text(`${dateLabel(day)} - ${timesheetHours(total)} hours`,12);
    for(const entry of entries){text(`${timesheetHours(entry.hours)} hours | ${entry.job_label||'Daily total / not allocated'}`,10);if(entry.notes)text(entry.notes,9,grey)}
   }
  }
 }
 const pages=pdf.getNumberOfPages();for(let i=1;i<=pages;i++){pdf.setPage(i);pdf.setDrawColor(220,228,235);pdf.line(16,281,194,281);pdf.setFontSize(8);pdf.setTextColor(...grey);pdf.text('Construct-360 | Timesheet report | Confidential',16,288);pdf.text(`${i} / ${pages}`,194,288,{align:'right'})}
 return pdf.output('blob');
}
