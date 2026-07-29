# on-camp for iPhone

A native iOS app around your Ontario Parks campsite journal. The web app in this repo is bundled in at
build time, so it works offline, keeps its log on the phone, and the share
buttons open the real iOS share sheet (iMessage, Mail, anywhere).

## Run it on your phone

On your Mac (Xcode 15 or newer, Apple Developer account):

1. Get the code and open the project:

       git clone https://github.com/katsuma0/on-camp.git
       cd on-camp
       git checkout claude/share    # or main once https://github.com/katsuma0/on-camp/pull/4 is merged
       open ios/OnCamp.xcodeproj

2. In Xcode, click the blue project icon, pick the "OnCamp" target,
   open "Signing & Capabilities", tick "Automatically manage signing" and
   choose your Team. If the bundle id is taken, change it to anything
   (for example add your initials).

3. Plug in your iPhone, choose it in the device menu at the top, and press
   Run. Xcode installs the app on your phone.

4. First time only, on the phone:
   - Settings -> Privacy & Security -> Developer Mode -> turn on (restarts).
   - If launch is blocked: Settings -> General -> VPN & Device Management ->
     trust your developer certificate.

## How it works

- `App/` is a small Swift shell: a full-screen WKWebView served from a local
  custom scheme (`app://localhost/`), the same architecture Capacitor uses,
  so localStorage and IndexedDB live in the app's own container.
- The "Bundle Web App" build phase copies the web files from the repo root
  into the app on every build. Edit the web app, press Run, done.
- A tiny injected bridge maps `navigator.share` to the native share sheet
  (the share card crosses as a real PNG), taps to haptics, and exports to a
  share sheet.
- External links (the official summary, the sibling apps) open in Safari.

The map tiles need a connection; everything else works offline.
