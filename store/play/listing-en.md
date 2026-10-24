# Google Play store listing — English

English (en-US) — translation. Play Console → Grow → Store presence → Main store listing → Manage translations → add English (United States). Copy the text from the code blocks as is. Counts are Unicode characters including spaces and line breaks, counted with `node`.

## Character counts

| Field | Limit | Count |
|---|---:|---:|
| App name | 30 | **23** |
| Short description | 80 | **71** |
| Full description | 4000 | **2432** |
| Release notes (first release, 5 lines) | 500 | **332** |

## App name (23/30)

```text
Ne Giysem? What to Wear
```

## Short description (71/80)

```text
See what to wear today at a glance, based on the weather where you are.
```

## Full description (2432/4000)

```text
One question to answer before you head out: what should I wear today?

Ne Giysem? ("What should I wear?" in Turkish) checks the forecast where you are and shows today's outfit as big, colourful stickers. The screen takes the colour of the day's temperature, so you can tell T-shirt weather from coat weather at a glance.

What it does
• Today's outfit from the feels-like temperature, rain, snow, wind and UV
• "Take along" tips: a cardigan if the evening turns cool, an umbrella for rain, sunglasses and sunscreen when the sun is strong
• Tap any sticker for a card that explains why it was suggested
• Hour-by-hour strip and a weekly view
• An alert when rain is on its way

Made for you
• "I get cold easily" or "I run warm": suggestions adjust to you
• City, outdoors or sport: different suggestions for what you'll be doing
• Profiles, for example a separate one for your child
• My wardrobe: mark the clothes you own

My day
Enter your trips once (home to school, work to home) with their steps: walking, waiting at the stop, metro, ferry and more. Ne Giysem? picks the outfit for the moments you will actually be outside and suggests the route that keeps you out of the rain or cold.

Travel
The packing list tells you what to take for how many days, based on the forecast at your destination, and lets you tick items off.

Handy
• Saved places, and search for neighbourhoods, schools, stops or addresses
• Home-screen widget: today's outfit without opening the app
• Pull to refresh; without internet the last weather is shown
• Share card: share today's suggestion as a picture
• Light and dark themes; Turkish and English

Privacy
No account needed. Your settings, places, routine and wardrobe stay on your device, and "Delete all my data" removes them. Your location is used only to find the weather and the place name, and never in the background. Approximate location permission is enough, and you can also search for a place without granting location access.

Ads and affiliate links
The app shows ads (Google AdMob). Some clothing items have links to Trendyol and Amazon.com.tr labelled "Buy / affiliate link". If you shop through them, the developer may earn a commission; your price stays the same. Suggestions are chosen by the weather; links are added afterwards.

Weather data: MET Norway (CC BY 4.0). Map data: © OpenStreetMap contributors.
Ne Giysem? is a small app made by an independent developer in Türkiye.
```

## Release notes (first release, 5 lines) (332/500)

```text
First release: today's outfit for the weather where you are, as big stickers.
My day: outfit for your trips and the route that keeps you out of the rain.
Weekly view, packing list and rain alert.
Home-screen widget, last weather offline, light and dark themes.
No account: your data stays on your device and is deleted with one tap.
```

## Other listing fields

- **Category, contact details, privacy policy, graphics:** same as the Turkish listing (`listing-tr.md`). Privacy policy URL stays `https://{{ALAN_ADI}}/gizlilik.html` (the page links to `privacy.html`).
- **Graphics:** use `graphics/feature-graphic-en.png` as the English feature graphic. Until the English UI ships, either keep the Turkish screenshots for English too or produce English ones with `SHOT_LANG=en` (TODO in `screenshots/make-screenshots.js`).
- **Written to Play’s metadata rules:** no “best”, “#1”, “free” or other ranking/price claims, no emoji, no ALL CAPS, no keyword stuffing. Ads and affiliate links are disclosed. Donations are not mentioned (there is no donation link in the Play app).
- **Before publishing:** delete any line about a feature that is not in the first release (e.g. profiles, wardrobe, English UI, weekly view); the listing must not promise anything the app does not do.
