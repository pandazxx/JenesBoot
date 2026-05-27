import"../../assets/modulepreload-polyfill-B5Qt9EMX.js";const a=new URLSearchParams(window.location.search),c=a.get("scenario")??"(none)",r=a.get("pauseAt")??"(none)",e=document.getElementById("params");e&&(e.innerHTML=`
    <dt>scenario</dt>
    <dd>${t(c)}</dd>
    <dt>pauseAt</dt>
    <dd>${t(r)}</dd>
  `);function t(n){return n.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}
