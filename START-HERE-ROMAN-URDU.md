# PinPilot AI — Roman Urdu Setup Guide

Bhai, is ZIP mein tera PinPilot AI source code aur supplied logo files included hain. Ye project ka source bundle hai; ZIP banne se live Netlify website apne aap update nahi hoti. Neeche setup ek baar karna hoga.

## 1) Supabase database

1. `https://supabase.com/dashboard/projects` par apna project banao (Free plan).
2. Project ke **SQL Editor** mein jao.
3. Is folder ki `supabase-schema.sql` file kholo, poora SQL copy karo aur SQL Editor mein run karo.
4. Project URL aur server-side `service_role` key ko Netlify Environment Variables mein add karna hai. `service_role` key ko `NEXT_PUBLIC_` naam mat dena aur kisi ko share mat karna.

## 2) Netlify environment variables

Netlify site `pinpilot-ai` → **Site configuration → Environment variables** mein ye variables set karne hain:

- `APP_URL` = `https://pinpilot-ai.netlify.app` (agar tera actual Netlify domain alag ho, woh use kar)
- `DASHBOARD_PASSWORD` = apna strong, unique private dashboard password
- `DASHBOARD_SESSION_SECRET` = kam az kam 32 characters ka random secret
- `TOKEN_ENCRYPTION_KEY` = exactly 64 hexadecimal characters (32 bytes)
- `SUPABASE_URL` = Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` = Supabase server-side service-role key
- `CRON_SECRET` = ek lamba, unique random secret
- `PINTEREST_CLIENT_ID` = Pinterest Developer App ID
- `PINTEREST_CLIENT_SECRET` = Pinterest App Secret (approval ke baad milega)
- `PINTEREST_REDIRECT_URI` = `https://pinpilot-ai.netlify.app/api/pinterest/callback`

**Kisi secret, App Secret, token ya service-role key ka screenshot/chat mein share na karna.** `TOKEN_ENCRYPTION_KEY` ko baad mein change karne se pehle token migration/disconnect plan banana hota hai; bina plan ke change mat karna.

## 3) Pinterest Developer app

1. Pinterest Developers ke Configure page mein redirect URI bilkul same add karo:
   `https://pinpilot-ai.netlify.app/api/pinterest/callback`
2. App status abhi `Trial access pending` hai to wait karna hoga; code approval bypass nahi kar sakta.
3. App approve ho aur credentials/required scopes available hon, tab live account connect karna.

## 4) Netlify par source update karna

1. ZIP download karke apne laptop par **Extract All** karo.
2. GitHub mein wohi repository kholo jo Netlify se linked hai.
3. **Add file → Upload files** use karo aur extracted folder ke andar ki files/folders upload karo (sirf ZIP ko repository mein rakhna kaafi nahi).
4. Existing matching files replace/commit karo. Check karo ke root mein `package.json`, `netlify.toml`, `supabase-schema.sql`, `app/`, `lib/`, `public/` aur `netlify/` hon.
5. Commit ke baad Netlify deploy complete hone do. `https://pinpilot-ai.netlify.app/` aur `/privacy` check karo.

Agar GitHub folder upload ya merge ka issue aaye, screenshot bhej; secrets expose kiye baghair usi screen se guide kiya ja sakta hai.

## 5) App use karna

- Pehli baar apna private dashboard password set karo aur unlock karo.
- Pinterest ko official OAuth se connect karo — password PinPilot mein enter nahi karna.
- Niche, audience, destination URL (apni website/Etsy listing), daily Pin limit aur timezone ek baar set karo.
- `Start Automation` dabao. Daily batch, generated graphics, queued posts aur run history server-side store hongi.
- Netlify Scheduled Function published deploy par har 15 minute mein due jobs check karti hai. Netlify Functions/Supabase/Pinterest ke current account limits apply ho sakte hain.

## Sachchi limitations

- Pinterest API approval aur granted permissions ke baghair live publishing/analytics enable nahi ho sakti.
- Is free-first build ke Pin images original template-rendered PNG designs hain; ye photographic/complex AI image model nahi hai.
- Trends, public competitor search aur kuch analytics endpoints approval/access tier ke mutabiq unavailable ho sakte hain. Dashboard/run log source unavailable dikhaye; fake stats nahi banata.
- Privacy Policy par genuine operator contact email add karna aur policy ko actual enabled data handling se match karna app review se pehle zaroori hai.
- Package/dependency install aur full production deployment ko tumhare Netlify/GitHub/Supabase account mein verify karna abhi baqi hai. ZIP mein source syntax-level checked hai; is environment mein full dependency-based build verify nahi ho saka.
