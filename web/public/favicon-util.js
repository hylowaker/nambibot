function setCircleFavicon(url) {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const r = size / 2;
    const border = 3;
    ctx.save();
    ctx.beginPath();
    ctx.arc(r, r, r - border, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(img, border, border, size - border * 2, size - border * 2);
    ctx.restore();
    ctx.beginPath();
    ctx.arc(r, r, r - border / 2, 0, Math.PI * 2);
    ctx.strokeStyle = '#6080ff';
    ctx.lineWidth = border;
    ctx.stroke();
    const favicon = document.querySelector('link[rel="icon"]');
    if (favicon) favicon.href = canvas.toDataURL('image/png');
  };
  img.src = url;
}
