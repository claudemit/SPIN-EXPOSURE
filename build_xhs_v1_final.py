from pathlib import Path
import base64
import re
import zipfile

root=Path(__file__).parent
source=(root/'spin_exposure_v1_final.html').read_text(encoding='utf-8')
target=root/'xhs-mini-tool-v1-final'
archive=root/'spin-exposure-xhs-v1-final.zip'
style=re.search(r'<style>(.*?)</style>',source,re.S).group(1)
script=re.search(r'<script>(.*?)</script>',source,re.S).group(1)
flower=re.search(r"const whiteFlowerSrc='data:image/jpeg;base64,([^']+)';",script)
if not flower:
    raise SystemExit('Embedded white-flower JPEG not found')
flower_bytes=base64.b64decode(flower.group(1),validate=True)
script=script[:flower.start()]+"const whiteFlowerSrc='./assets/white-flower.jpg';"+script[flower.end():]

def replace_once(old,new):
    global script
    if script.count(old)!=1:
        raise SystemExit(f'Expected exactly one match: {old[:70]}')
    script=script.replace(old,new,1)

replace_once('specs.push({...base,localDeg0,localDeg1,N0:first.count,N1:second.count,N:first.count+second.count});',
             'specs.push(Object.assign({},base,{localDeg0,localDeg1,N0:first.count,N1:second.count,N:first.count+second.count}));')
replace_once('specs.push({...base,N:sample.count});',
             'specs.push(Object.assign({},base,{N:sample.count}));')
replace_once('renderPass({...spec,localDeg:spec.localDeg0,N:spec.N0})',
             'renderPass(Object.assign({},spec,{localDeg:spec.localDeg0,N:spec.N0}))')
replace_once('renderPass({...spec,localDeg:spec.localDeg1,N:spec.N1})',
             'renderPass(Object.assign({},spec,{localDeg:spec.localDeg1,N:spec.N1}))')
replace_once('composeZone({...surface,zoneCanvas:surface.frameCanvas,zctx:surface.frameCtx},g,specs[index],index);',
             'composeZone(Object.assign({},surface,{zoneCanvas:surface.frameCanvas,zctx:surface.frameCtx}),g,specs[index],index);')
replace_once("const file=event.target.files?.[0];", "const file=event.target.files&&event.target.files[0];")
replace_once("}).finally(()=>{activeHQ=null;setBusy(false);});",
             "}).then(()=>{activeHQ=null;setBusy(false);});")
replace_once("  stage.style.aspectRatio=`${main.width}/${main.height}`;\n",'')
replace_once("const direction=1,FOCUS_K=10,lab={k:FOCUS_K,zones:36,overlap:3,blend:'CROSSFADE',focus:50};",
             "const direction=1,FOCUS_K=10,lab={k:FOCUS_K,zones:28,overlap:3,blend:'CROSSFADE',focus:50};\n"
             "const MOBILE_PREVIEW_MAX_SIDE=420,LARGE_PREVIEW_MAX_SIDE=600;\n"
             "const PREVIEW_TARGET_STEP=1.6,PREVIEW_SAMPLE_CAP=128;\n"
             "const EXPORT_MAX_SIDE=1200,EXPORT_TARGET_STEP=2.4,EXPORT_SAMPLE_CAP=128;")
replace_once("targetStep:low?4.2:1.12,sampleCap:low?24:384",
             "targetStep:low?4.2:PREVIEW_TARGET_STEP,sampleCap:low?24:PREVIEW_SAMPLE_CAP")
replace_once("1600/Math.max(sourceNaturalWidth,sourceNaturalHeight)",
             "EXPORT_MAX_SIDE/Math.max(sourceNaturalWidth,sourceNaturalHeight)")
replace_once("targetStep:renderMode==='GEOMETRY_HQ'?2.0:1.8,sampleCap:renderMode==='GEOMETRY_HQ'?512:192",
             "targetStep:renderMode==='GEOMETRY_HQ'?2.0:EXPORT_TARGET_STEP,sampleCap:renderMode==='GEOMETRY_HQ'?512:EXPORT_SAMPLE_CAP")
replace_once("window.innerWidth<=600?560:760",
             "window.innerWidth<=600?MOBILE_PREVIEW_MAX_SIDE:LARGE_PREVIEW_MAX_SIDE")

replace_once("  if(exportRunning||!img)return;\n  exportRunning=true;",
             "  if(exportRunning||!img)return;\n  const miniTool=window.xhs&&window.xhs.miniTool;\n  if(miniTool&&typeof miniTool.saveImageToPhotosAlbum!=='function'){setStatus('当前小工具不支持保存到相册');return;}\n  exportRunning=true;")
old="""    const url=URL.createObjectURL(blob),link=document.createElement('a');
    link.href=url;link.download=exportFileName();link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
    setStatus('生成完成');button.textContent='图片已生成';"""
new="""    if(miniTool){
    const dataUrl=await new Promise((resolve,reject)=>{
      const reader=new FileReader();
      reader.onload=()=>resolve(reader.result);
      reader.onerror=()=>reject(reader.error||new Error('图片编码失败'));
      reader.readAsDataURL(blob);
    });
    if(expected!==revision||exportId!==hqExportId||img!==sourceImage)return;
    setStatus('正在保存到相册');button.textContent='正在保存到相册';
    let filePath=dataUrl;
    if(typeof miniTool.writeTempFile==='function'){
      const temp=await miniTool.writeTempFile({data:dataUrl});
      if(!temp||!temp.filePath)throw new Error('临时图片保存失败');
      filePath=temp.filePath;
    }
    if(expected!==revision||exportId!==hqExportId||img!==sourceImage)return;
    await miniTool.saveImageToPhotosAlbum({filePath});
    if(expected!==revision||exportId!==hqExportId||img!==sourceImage)return;
    setStatus('已保存到相册');button.textContent='已保存到相册';
    }else{
      const url=URL.createObjectURL(blob),link=document.createElement('a');
      link.href=url;link.download=exportFileName();
      document.body.appendChild(link);link.click();link.remove();
      setTimeout(()=>URL.revokeObjectURL(url),60000);
      setStatus('已开始下载 PNG');button.textContent='已开始下载';
    }"""
replace_once(old,new)
replace_once("  }catch(error){console.error(error);setStatus('导出失败，请重试');}",
             "  }catch(error){\n    console.error(error);\n    const reason=String(error&&((error.errMsg)||error.message)||'');\n    setStatus(/auth|permission|denied|权限|拒绝/i.test(reason)?'相册权限未开启，请允许小红书保存照片后重试':'生成或保存失败，请重试');\n  }")
replace_once("setTimeout(()=>{if(!exportRunning)button.textContent='导出图片';},1200);",
             "setTimeout(()=>{if(!exportRunning)button.textContent=window.xhs&&window.xhs.miniTool?'保存到相册':'保存到本地';},1200);")
replace_once("$('#exportBtn').onclick=exportImage;",
             "$('#exportBtn').textContent=window.xhs&&window.xhs.miniTool?'保存到相册':'保存到本地';\n$('#exportBtn').onclick=exportImage;")

style=style.replace('.app{width:min(100%,520px);margin:auto}',
                    '.app{width:100%;max-width:520px;margin:auto}')
style=style.replace('gap:8px','grid-gap:8px').replace('gap:10px','grid-gap:10px')
style=style.replace('input[type=range]{appearance:none;',
                    'input[type=range]{-webkit-appearance:none;appearance:none;')
style=style.replace('.preset:focus-visible{','.preset:focus{')
style=style.replace('.action:focus-visible,input:focus-visible{','.action:focus,input:focus{')
style += '''\nbody{padding-top:18px;padding-bottom:32px;padding-top:calc(18px + var(--safe-area-inset-top, env(safe-area-inset-top, 0px)));padding-bottom:calc(32px + var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)));-webkit-touch-callout:none}
@media(max-width:420px){body{padding-top:12px;padding-bottom:24px;padding-top:calc(12px + var(--safe-area-inset-top, env(safe-area-inset-top, 0px)));padding-bottom:calc(24px + var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)))}}
'''
html=re.sub(r'<style>.*?</style>','<style>'+style+'</style>',source,count=1,flags=re.S)
html=re.sub(r'<script>.*?</script>','<script src="./app.js"></script>',html,count=1,flags=re.S)
old_button='id="exportBtn" type="button">导出图片</button>'
if html.count(old_button)!=1:
    raise SystemExit('Export button not found exactly once')
html=html.replace(old_button,'id="exportBtn" type="button">保存到相册</button>',1)
target.mkdir(exist_ok=True)
(target/'assets').mkdir(exist_ok=True)
(target/'index.html').write_text(html,encoding='utf-8')
(target/'app.js').write_text(script,encoding='utf-8')
(target/'assets'/'white-flower.jpg').write_bytes(flower_bytes)
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
    for file in [target/'index.html',target/'app.js',target/'assets'/'white-flower.jpg']:
        z.write(file,file.relative_to(target).as_posix())
print('dir',target,'zip',archive,'flower',len(flower_bytes))
