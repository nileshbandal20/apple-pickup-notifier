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
        "Accept": "*/*",
        "Accept-Language": "en-US,en;q=0.9",
		"priority" :"u=1, i",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
        "Referer": "https://www.apple.com/in/shop/buy-iphone",
        "sec-ch-ua": "\"Google Chrome\";v=\"141\", \"Not?A_Brand\";v=\"8\", \"Chromium\";v=\"141\"",
        "sec-ch-ua-platform": "\"Windows\"",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin",
        "x-aos-ui-fetch-call-1": "9vp7kp6n89-mgfge6xl",
        "Cookie": "dssid2=33e80e98-29e9-4933-ab60-0507bf944dda; dssf=1; geo=IN; s_campaign=aos-in-kwgo-brand--; s_cc=true; as_rumid=307bc8fe-9309-4657-abf8-26ba0fa33a74; as_uct=0; as_dc=ucp5; sh_spksy=.; s_fid=04D8C7CD5ECA54A1-01D373DBE48DCF09; s_vi=[CS]v1|3472017951B3F4AE-60001C2A404BA09D[CE]; shld_bt_ck=z_k2Sq2kjdpkvpifZ4p7Sw|1759780635|gT1sKGEXuw94qPJZueZlzs7coTbGjXmfDaAPqTc7A7BiyBzmstgNlpROxeriRtdSPBBJyakjdaf3mC4qEPcTk4EKsynjV6mD0azpqj7M-f-vupEzeRMXJP7q71tQSdKXOiuiSOVpdz3nwvCwJi1i-t2raOfhC-orcmC6XcnMDM7IsRJEIyQ58Uq2uWjv3JmPPLyEkVx587qIqcHURwl76rIp5x5nd5ll2WQkz9P-vBk4P9iHWcB26CcoK-656WqzlcTB5z_u9__7-CrSD1L1jU6pID60AIkgD4KXEzfLdxEN-hPgx4oXNUlF01g6KwVBYgZmBVFxEsU042g330puDw|CMNQ5Drr4rG70GPGjka3AR79NEc; as_pcts=g21JMZQXO6QRU5PI7fxWwVmvnT1fnR1XNeZOgqyMwhesMINItJAc1NajZOgCYs6xYoEzHaXjZixO-Gg9zVY1tINCB1tb8HjoNLxltukGBzMasnra+IlW6iZeCGsDPXbRohVqC0Hgs738yByg:VRktoomwkjRhKVG4Vznbz:bAuDGfj8mzn4; as_affl=p240%7C%7Cken_pid%3A%3Ago~cmp-11116556120~adg-109516736339~ad-774710206782_kwd-297832030443~dev-c~ext-~prd-~mca-~nt-search%26cid%3A%3Aaos-in-kwgo-brand--%26token%3A%3A8c1a76ab-cfe5-4380-b551-e755a3b48bc8%26%7C%7C20251006_110000; as_sfa=Mnxpbnxpbnx8ZW5fSU58Y29uc3VtZXJ8aW50ZXJuZXR8MHwwfDE; s_afc=p240%7Cgo%7Ecmp-11116556120%7Eadg-109516736339%7Ead-774710206782_kwd-297832030443%7Edev-c%7Eext-%7Eprd-%7Emca-%7Ent-search; as_gloc=1b5eac2d18d706927094fbf88b1f3fd4427268b0bd5ceff38776461ccd6f81450082738b31668cd4eea1253464a4761cd4360d21249636e9f7fb925bdec0eee1654d19b1b22c847d6539baf0295fbc6a41392f29a4602019f2c4c9abd660faa2; as_atb=1.0|MjAyNS0xMC0wNiAxMToxNzoxNg|207eb53417bce80efd88ece0d2e3d153f1b20afe; shld_bt_m=ICUHXetK7NX_HZY1FyX_1Q|1759781855|E7P4xXMTntOgZ_dKnFQVbA|a7Js7FE7EA9Pfb_YYzgQj6E_uZU; s_sq=%5B%5BB%5D%5D"
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
