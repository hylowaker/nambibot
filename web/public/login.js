let _errTimer = null;
function showErr() {
  clearTimeout(_errTimer);
  err.classList.add('visible');
  _errTimer = setTimeout(() => err.classList.remove('visible'), 4000);
}

const form        = document.getElementById('login-form');
const input       = document.getElementById('password');
const err         = document.getElementById('login-error');
const card        = document.querySelector('.login-card');
const submit      = form.querySelector('.login-submit');
const connBadge   = document.getElementById('conn-badge');
const avatarImg   = document.getElementById('login-avatar');
const avatarFb    = document.getElementById('login-avatar-fallback');
const profileName = document.getElementById('login-profile-name');

let _pollTimer = null;
function schedulePoll(ms) {
  clearTimeout(_pollTimer);
  _pollTimer = setTimeout(() => { updateBotProfile(); }, ms);
}

function updateBotProfile() {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 2000);
  fetch('/api/bot-profile', { signal: ctrl.signal })
    .then(r => { clearTimeout(timer); return r.ok ? r.json() : null; })
    .then(data => {
      const online = !!(data?.username);
      if (online) {
        if (data.username) profileName.textContent = data.username;
        if (data.avatar) {
          avatarImg.src = data.avatar;
          avatarImg.style.display = '';
          avatarFb.style.display = 'none';
          setCircleFavicon(data.avatar);
        }
        connBadge.textContent = '연결됨';
        connBadge.className   = 'ok';
        document.body.classList.remove('ui-disabled');
        input.disabled = false;
        submit.disabled = input.value.length === 0;
      } else {
        setOffline();
      }
      schedulePoll(online ? 2000 : 1000);
    })
    .catch(() => { clearTimeout(timer); setOffline(); schedulePoll(1000); });
}

function setOffline() {
  connBadge.textContent = '오프라인';
  connBadge.className   = 'err';
  document.body.classList.add('ui-disabled');
  input.blur();
  input.disabled = true;
  submit.disabled = true;
}

updateBotProfile();

submit.disabled = true;
input.addEventListener('input', () => {
  submit.disabled = input.value.length === 0;
});

const capsWarn = document.getElementById('caps-warn');
input.addEventListener('keydown', (e) => {
  capsWarn.style.display = e.getModifierState('CapsLock') ? '' : 'none';
});
input.addEventListener('keyup', (e) => {
  capsWarn.style.display = e.getModifierState('CapsLock') ? '' : 'none';
});

async function sha256hex(str) {
  const data = new TextEncoder().encode(str);
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  function rr(n,x){return(x>>>n)|(x<<(32-n));}
  const K=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
  let h0=0x6a09e667,h1=0xbb67ae85,h2=0x3c6ef372,h3=0xa54ff53a,h4=0x510e527f,h5=0x9b05688c,h6=0x1f83d9ab,h7=0x5be0cd19;
  const l=data.length,bl=l*8;
  const pad=new Uint8Array(((l+9+63)&~63));
  pad.set(data);pad[l]=0x80;
  const dv=new DataView(pad.buffer);dv.setUint32(pad.length-4,bl);
  for(let o=0;o<pad.length;o+=64){
    const w=new Int32Array(64);
    for(let i=0;i<16;i++)w[i]=dv.getInt32(o+i*4);
    for(let i=16;i<64;i++){const s0=(rr(7,w[i-15])^rr(18,w[i-15])^(w[i-15]>>>3)),s1=(rr(17,w[i-2])^rr(19,w[i-2])^(w[i-2]>>>10));w[i]=(w[i-16]+s0+w[i-7]+s1)|0;}
    let a=h0,b=h1,c=h2,d=h3,e=h4,f=h5,g=h6,h=h7;
    for(let i=0;i<64;i++){const S1=rr(6,e)^rr(11,e)^rr(25,e),ch=(e&f)^(~e&g),t1=(h+S1+ch+K[i]+w[i])|0,S0=rr(2,a)^rr(13,a)^rr(22,a),maj=(a&b)^(a&c)^(b&c),t2=(S0+maj)|0;h=g;g=f;f=e;e=(d+t1)|0;d=c;c=b;b=a;a=(t1+t2)|0;}
    h0=(h0+a)|0;h1=(h1+b)|0;h2=(h2+c)|0;h3=(h3+d)|0;h4=(h4+e)|0;h5=(h5+f)|0;h6=(h6+g)|0;h7=(h7+h)|0;
  }
  return [h0,h1,h2,h3,h4,h5,h6,h7].map(v=>(v>>>0).toString(16).padStart(8,'0')).join('');
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  err.classList.remove('visible');
  submit.disabled = true;
  input.disabled = true;

  try {
    const challengeRes = await fetch('/api/auth/challenge');
    const { nonce } = await challengeRes.json();
    const hash = await sha256hex(input.value + nonce);
    const res = await fetch('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nonce, hash }),
    });

    if (res.ok) {
      const { redirect, sessionKey } = await res.json();
      if (sessionKey) sessionStorage.setItem('nambibot_sk', sessionKey);
      clearTimeout(_pollTimer);
      _pollTimer = null;
      document.body.style.transition = 'opacity 0.3s ease';
      document.body.style.opacity = '0';
      setTimeout(() => { window.location.href = redirect || '/'; }, 300);
    } else {
      showErr();
      input.value = '';
      input.focus();
      card.classList.remove('shake');
      void card.offsetWidth;
      card.classList.add('shake');
    }
  } catch (ex) {
    console.error('[login] 오류:', ex);
    showErr();
  } finally {
    if (!document.body.classList.contains('ui-disabled')) {
      input.disabled = false;
      submit.disabled = input.value.length === 0;
    }
  }
});
