const fs = require('fs');
const yaml = require('yaml');
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');
const axios = require('axios').default;
const { sendNotification } = require("./notify");

const config = yaml.parse(fs.readFileSync('./config.yml', 'utf8'));

// Create a shared cookie jar
const jar = new CookieJar();
const client = wrapper(axios.create({ jar, withCredentials: true }));

const checkAvailability = async () => {
  // Step 1: Initialize session (get cookies like browser)
  await client.get("https://www.apple.com/in/shop/buy-iphone/iphone-17-pro", {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9",
    }
  });

  // Step 2: Prepare params dynamically
  const partParams = config.parts.reduce(
    (acc, val, idx) => {
      acc[`parts.${idx}`] = val;
      return acc;
    }, {}
  );

  // Step 3: Fetch fulfillment data (cookies auto-included)
  const { data } = await client.get(`https://www.apple.com/in/shop/fulfillment-messages`, {
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
      "Referer": "https://www.apple.com/in/shop/buy-iphone/iphone-17-pro"
    }
  });

  // Step 4: Extract store data as before
  const stores = data.body?.content?.pickupMessage?.stores || [];

  const res = [];
  for (const storeNumber of config.stores) {
    const store = stores.find(s => s.storeNumber === storeNumber);
    if (!store) continue;
    for (const part of Object.keys(store.partsAvailability)) {
      const availability = {
        ...store.partsAvailability[part],
        ...store.partsAvailability[part].messageTypes.compact
      };

      const available = availability.storeSelectionEnabled;
      res.push({ part, store: { number: store.storeNumber, name: store.storeName }, available, data: availability });
    }
  }

  return res;
};

											
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
