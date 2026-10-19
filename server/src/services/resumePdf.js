export function makePdf(text){
  const knownSkills={
    javascript:['JavaScript','Languages'],typescript:['TypeScript','Languages'],python:['Python','Languages'],java:['Java','Languages'],
    'c++':['C++','Languages'],'c#':['C#','Languages'],go:['Go','Languages'],ruby:['Ruby','Languages'],php:['PHP','Languages'],sql:['SQL','Databases'],
    react:['React','Frameworks & Libraries'],angular:['Angular','Frameworks & Libraries'],vue:['Vue','Frameworks & Libraries'],
    'node.js':['Node.js','Frameworks & Libraries'],express:['Express','Frameworks & Libraries'],django:['Django','Frameworks & Libraries'],
    flask:['Flask','Frameworks & Libraries'],'next.js':['Next.js','Frameworks & Libraries'],'spring':['Spring','Frameworks & Libraries'],
    html:['HTML','Web Technologies'],css:['CSS','Web Technologies'],'tailwind css':['Tailwind CSS','Web Technologies'],
    mongodb:['MongoDB','Databases'],postgresql:['PostgreSQL','Databases'],mysql:['MySQL','Databases'],redis:['Redis','Databases'],
    git:['Git','Tools & Platforms'],github:['GitHub','Tools & Platforms'],docker:['Docker','Tools & Platforms'],kubernetes:['Kubernetes','Tools & Platforms'],
    aws:['AWS','Tools & Platforms'],azure:['Azure','Tools & Platforms'],'google cloud':['Google Cloud','Tools & Platforms'],
  };
  const skillKey=value=>value.trim().replace(/\s+/g,' ').toLocaleLowerCase();
  const formatSkills=line=>{
    const match=/^(\s*(?:technical\s+)?skills\s*:\s*)(.*)$/i.exec(line);
    if(!match)return [line];
    const skills=match[2].split(/[,;|\n]/).map(value=>value.trim()).filter(Boolean),seen=new Set(),groups=new Map();
    for(const skill of skills){const key=skillKey(skill);if(!key||seen.has(key))continue;seen.add(key);const [display,category]=knownSkills[key]||[skill.replace(/^\p{L}/u,letter=>letter.toLocaleUpperCase()),'Other Skills'];if(!groups.has(category))groups.set(category,[]);groups.get(category).push(display)}
    return groups.size?[match[1].replace(/:\s*$/,''),...[...groups].map(([category,items])=>`${category}: ${items.join(', ')}`)]:[match[1].trimEnd()];
  };
  const source=String(text??'').replace(/\r\n?/g,'\n').split('\n').flatMap(line=>{
    const technology=line.search(/\b(?:technologies|tech\s+stack)\s*:/i);
    const pieces=technology>0?[line.slice(0,technology).trimEnd(),line.slice(technology).trimStart()]:[line];
    return pieces.flatMap(formatSkills);
  });
  const lines=[];
  const headingPattern=/^(summary|professional summary|technical skills|skills|projects|selected projects|experience|work experience|professional experience|education|certifications|awards)\s*:?$/i;
  for(const raw of source){
    const line=raw.trim();
    if(!line){if(lines.length&&lines.at(-1)!=='')lines.push('');continue}
    const isHeading=headingPattern.test(line);
    if(isHeading&&lines.length&&lines.at(-1)!=='')lines.push('');
    const isBullet=/^[\u2022\u25cf\u25aa\u25e6*\-]\s*/.test(line);
    if(isBullet&&lines.length&&lines.at(-1)!==''&&/^[\u2022\u25cf\u25aa\u25e6*\-]\s*/.test(lines.at(-1)))lines.push('');
    lines.push(isBullet?`\u2022 ${line.replace(/^[\u2022\u25cf\u25aa\u25e6*\-]+\s*/, '')}`:line);
    if(isHeading)lines.push('');
  }
  while(lines.at(-1)==='')lines.pop();
  const cp1252={'€':0x80,'‚':0x82,'ƒ':0x83,'„':0x84,'…':0x85,'†':0x86,'‡':0x87,'ˆ':0x88,'‰':0x89,'Š':0x8a,'‹':0x8b,'Œ':0x8c,'Ž':0x8e,'‘':0x91,'’':0x92,'“':0x93,'”':0x94,'•':0x95,'–':0x96,'—':0x97,'˜':0x98,'™':0x99,'š':0x9a,'›':0x9b,'œ':0x9c,'ž':0x9e,'Ÿ':0x9f};
  const pdfText=value=>'('+[...value].map(char=>{const code=cp1252[char]??char.codePointAt(0);if(code>255)return '?';if(char==='('||char===')'||char==='\\')return `\\${char}`;if(code<32||code>126)return `\\${code.toString(8).padStart(3,'0')}`;return char}).join('')+')';
  const charWidth=char=>/\s/.test(char)?2.8:/[ilI.,:;'!|]/.test(char)?2.8:/[mwMW@%&]/.test(char)?8.2:/[A-Z]/.test(char)?6.5:5.2;
  const maxWidth=490;
  const wrap=line=>{const words=line.split(/\s+/),out=[];let current='';for(const word of words){const candidate=current?`${current} ${word}`:word;if(current&&[...candidate].reduce((sum,char)=>sum+charWidth(char),0)>maxWidth){out.push(current);current=word}else current=candidate}if(current)out.push(current);return out};
  let page=[],y=790;
  const pages=[];
  for(const line of lines){
    if(!line){page.push({text:'',y:y-7});y-=7;continue}
    const bullet=line.startsWith('\u2022 '),wrapped=wrap(bullet?line.slice(2):line);
    for(let i=0;i<wrapped.length;i++){
      if(y<48){pages.push(page);page=[];y=790}
      page.push({text:`${bullet&&i===0?'\u2022 ':''}${wrapped[i]}`,y,x:bullet?64:(i?74:54),bold:headingPattern.test(line)});y-=14;
    }
  }
  if(page.length||!pages.length)pages.push(page);
  const objects=['','<< /Type /Catalog /Pages 2 0 R >>','',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'];
  const pageRefs=[];
  pages.forEach((items,index)=>{
    const content=items.map(item=>item.text?`BT /${item.bold?'F2':'F1'} 10 Tf ${item.x} ${item.y} Td ${pdfText(item.text)} Tj ET`:'').filter(Boolean).join('\n');
    const contentId=objects.length;objects.push(`<< /Length ${Buffer.byteLength(content,'ascii')} >>\nstream\n${content}\nendstream`);
    const pageId=objects.length;objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`);pageRefs.push(`${pageId} 0 R`);
  });
  objects[2]=`<< /Type /Pages /Kids [${pageRefs.join(' ')}] /Count ${pages.length} >>`;
  let output='%PDF-1.4\n';const offsets=[0];
  for(let id=1;id<objects.length;id++){offsets[id]=Buffer.byteLength(output,'ascii');output+=`${id} 0 obj\n${objects[id]}\nendobj\n`}
  const xrefOffset=Buffer.byteLength(output,'ascii');output+=`xref\n0 ${objects.length}\n0000000000 65535 f \n${offsets.slice(1).map(offset=>String(offset).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(output,'ascii');
}