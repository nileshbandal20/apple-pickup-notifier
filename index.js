const fs = require('fs');
const yaml = require('yaml')
const axios = require('axios').default;
const { sendNotification } = require("./notify");

const config = yaml.parse(fs.readFileSync('./config.yml', 'utf8'));

const checkAvailability = async () => {
  const partParams = config.parts.reduce(
    (acc, val, idx) => {
      acc[`parts.${idx}`] = val; 
      return acc;
    }, {}
  );

  const { data, config: x } = await axios.get(`https://www.apple.com/in/shop/fulfillment-messages`, { 
    params: {
      cppart: config.carrier, 
      location: config.location,
      pl: true,
      "mts.0": "compact",
      ...partParams
    },
    headers: {
    "accept": "*/*",
    "accept-language": "en-US,en;q=0.9,mr;q=0.8",
    "priority": "u=1, i",
    "sec-ch-ua": "\"Google Chrome\";v=\"141\", \"Not?A_Brand\";v=\"8\", \"Chromium\";v=\"141\"",
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": "\"Windows\"",
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin",
    "x-aos-ui-fetch-call-1": "iul8wm5wk7-mggokxqb",
    "x-skip-redirect": "true",
    "cookie": "dssf=1; dssid2=780b5bd9-89e4-41d8-9d01-378275cf95b1; as_uct=0; pxro=1; as_disa=AAAjAAABc4tCej5oWyHwqE-Qu79T9d79m0pDNjb7mtDze2q9tMH1njBAQUROfcQ3gZCoYBWiAAIBRlezInO8qpjSdRbk6lSfqR7tOxeLYVXMtKej9x6EFUg=; geo=IN; s_cc=true; as_rumid=80a1fcd5-95b3-4f67-94a2-1ba6dc358550; as_sfa=Mnxpbnxpbnx8ZW5fSU58Y29uc3VtZXJ8aW50ZXJuZXR8MHwwfDE; dslang=IN-EN; site=IND; rtsid=%7BIN%3D%7Bt%3Da%3Bi%3DR744%3B%7D%3B%7D; as_loc=68b6ab88494ca040dc241f9f85f96c8544358daf4459c32192a8787355a80fd4ecb90b97f325afb6f2f6602edf601be5a79f2d697e121702bf5274483976da434fdc14eacbb72725a66d93ba4105ef4f32ed641266b34a269528b09aed47a4eb; as_pcts=hUw9gdUiwxkercfASr5w2Lj-o496kaXQvxtrH9up2GefupIKwqbGpqXMJSfY5UhTAgWaocvG1w3BaSF41kzQXzvAhI0NMSWRxfhP8cD9s8lEzz; s_fid=730A1C69598C4777-14AB9141EAD18E3F; as_dc=ucp5; sh_spksy=.; s_vi=[CS]v1|347294CE117B8830-60001CA961C0D8B0[CE]; s_sq=%5B%5BB%5D%5D; as_atb=1.0|MjAyNS0xMC0wNyAwNzo1NDoyMg|f2dcda9fcbb9f9df49f6df9f590996e9943082f4; shld_bt_ck=cBcbjy_QpD7r4kY3luaexQ|1759856066|zDOXZTBccLY6fO99qfYfSb6Gz3aTtXluCosLPYK_OVSJswwj7CGwJnZkUWndkKYBrG7VfQCIqhoGbxrATpDR1jtd6IF8vOgZ8LtUCT0bqKpTKRR3QY65bK3LVhSS7M-4ihl0tC1GTqhXhBQF_s8g3Mq5yZviTvbXL8_7nMSi2bMvC8d0r9MfhcFebSzzA1MV8ckN29T3lsQPWi5rsORjOvY0pVB12_EypeLhtnEI_T20mSzUU0eQLjn1Nd6XbRy6WW9SosNG0jMpy6zwzN_yMlr0_NyIDTTQ6ywiNq6fzo6mzAQOIzeXRblzSs4T_jUK7DVs82c_0CwrtCK2VcmFTw|e_q2IqTZmHupNJXPIAVq4afJYko; shld_bt_m=43hV97TxyDE3i1cpgbGNoQ|1759856071|c9xAq0QfLbL_JIxKFm2vzA|CVZKwMsPSDvk4RCFrzZr2tKEuKw",
    "Referer": "https://www.apple.com/in/shop/buy-iphone/iphone-17-pro"
  }
  });

  const stores = data.body.content.pickupMessage.stores;

  const res = [];
  for(const storeNumber of config.stores) {
    const store = stores.find(s => s.storeNumber === storeNumber);
    if (!store) continue;
    for(const part of Object.keys(store.partsAvailability)) {
      const availability = {
        ...store.partsAvailability[part],
        ...store.partsAvailability[part].messageTypes.compact
      };
  
      const available = availability.storeSelectionEnabled;
      res.push({part, store: {number: store.storeNumber, name: store.storeName}, available, data: availability});
    }
  }

  return res;
}

const availabilityMap = {};

const getAvailabilityKey = (store, part) => {
  return `${store}-${part}`;
}

const loop = async () => {
  console.log("👀 Checking availability...");

  const availabilityList = await checkAvailability();
  for(const {part, store, available, data} of availabilityList) {
    const icon = available ? "✅" : "❌";
    console.log(`${icon} (${part}) [${store.name}] ${data.storePickupProductTitle} ${data.pickupDisplay} at ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`);

    const availabilityKey = getAvailabilityKey(store.number, part);
    let wasAvailable = availabilityMap[availabilityKey];
    let isAvailable = availabilityMap[availabilityKey];

    if(available) {
      if(wasAvailable && !config.notifications.alwaysNotify) {
        continue;
      }
      console.log("Notifying due to availability change");
      await sendNotification({
        title: "Available for pickup", 
        message: `${data.storePickupQuote} at ${store.name}: ${data.storePickupProductTitle}`, 
        priority: 1
      });
      isAvailable = true;
    } else {
      if(!wasAvailable && !config.notifications.alwaysNotify) {
        continue;
      }
      console.log("Notifying due to availability change");
      await sendNotification({
        title: "Unavailable for pickup", 
        message: `${data.storePickupQuote} at ${store.name}: ${data.storePickupProductTitle}`,
      });
      isAvailable = false;
    }

    availabilityMap[availabilityKey] = isAvailable;
  }
}

setInterval(loop, config.interval);
loop();
//&cppart=UNLOCKED/US&parts.0=MLTP3LL/A&location=Boca%20Raton,%20FL
