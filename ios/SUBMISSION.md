# Submitting on-site to the App Store

Everything App Store Connect will ask for, with the answer already worked out.
Written against the App Review Guidelines as published on 15 August 2026.

## URLs, which must be live before you submit

Guideline 2.1(a) rejects placeholder text and empty websites, so these have to
resolve to real pages, not stubs.

| App Store Connect field | URL |
| --- | --- |
| Privacy Policy URL (required) | https://katsuma.ca/privacy.html |
| Support URL (required) | https://katsuma.ca/support.html |
| Marketing URL (optional) | https://katsuma.ca/camp.html |

All three are also reachable inside the app, under More, then Legal. Guideline
5.1.1 asks for the privacy policy in both places, not just the listing.

## App Privacy, the nutrition label

In App Store Connect, App Privacy, the honest answer for every question is
**"Data Not Collected"**.

- There is no account, no analytics SDK, no advertising SDK and no tracking.
- Every rating, note and photo is written to storage inside the app container
  and is never transmitted. I never receive it and cannot read it.
- Sharing a park review builds an image on the device and hands it to the iOS
  share sheet. It goes wherever the person sends it, and never to me.
- Map tiles are an ordinary third-party request. They carry an IP address the
  way any web request does, and are not linked to a user or used to track.

Answer **No** to App Tracking Transparency. Nothing is tracked, no IDFA is
requested, and no `NSUserTrackingUsageDescription` is needed.

## Permissions, and the strings in the project

Set in `OnCamp.xcodeproj/project.pbxproj` as `INFOPLIST_KEY_*` entries.
Check each one still describes what the app does before you submit, because
guideline 5.1.1(ii) asks that purpose strings completely describe the use.

| Key | Purpose |
| --- | --- |
| `NSLocationWhenInUseUsageDescription` | Centre the map on you. Never in the background. |
| `NSCameraUsageDescription` | Attach a photo to a campsite you are rating. |
| `NSPhotoLibraryUsageDescription` | Pick a photo from the library for a campsite. |
| `ITSAppUsesNonExemptEncryption` | `NO` |

No location is requested until the person taps a control that needs one, and
every screen works if they decline.

## Guideline 4.2, minimum functionality

Answer it in the review notes before it is asked. Paste this into App Review
Information, Notes:

> This is not a web view onto a website. Every reservable Ontario Park, down to
> its campgrounds, individual sites and trails, is bundled in the binary, and
> the app works with the device in airplane mode. There is no server and no
> account. The app uses the camera, Location Services, haptics and the iOS
> share sheet.
>
> To test offline, which is the primary use case: launch the app, put the
> device in airplane mode, open any park, rate a site, add a note and a photo,
> and read it back from the Journal tab. All of it works. Map tiles are the one
> thing that needs a connection, and the app says so.

## Guideline 1.2, other people's content

Not applicable. Nothing another person wrote is ever displayed. Ratings and
notes are private to the device, and the only sharing is an image the user
hands to the iOS share sheet themselves.

## Age rating

Answer every content question **None**. Expect 4+.

## Account deletion, guideline 5.1.1(v)

Not applicable: no account creation, so no in-app account deletion is required.
Data deletion exists anyway, under More, then Your data.

## Third-party material to declare

- Map images: CARTO, rendering OpenStreetMap data, © OpenStreetMap
  contributors. Attribution is shown on the map and in More.
- Park, campground, site and trail data: Government of Ontario open data.
- Leaflet, BSD 2-Clause, vendored in `vendor/leaflet/`.

The app claims no affiliation with Ontario Parks, the Government of Ontario or
Apple, and says so in More, in the privacy policy and in the terms. Booking is
directed to their official channels. This matters here more than in the sibling
app, because the whole subject is a government-run park system: nothing in the
listing or the app may read as official.

## Before you press submit

- [ ] The three URLs above load and are not placeholders.
- [ ] Screenshots for 6.9 inch and 6.5 inch iPhone, plus iPad if
      `TARGETED_DEVICE_FAMILY` stays `1,2`.
- [ ] `MARKETING_VERSION` matches the version shown in the app's More screen.
- [ ] Icon is 1024x1024 with no alpha.
- [ ] Tested on a real device in airplane mode, per the note above.
- [ ] Export compliance is already answered by `ITSAppUsesNonExemptEncryption`.

## Listing copy

**Name:** on-site

**Subtitle:** Rate Ontario Parks campsites

**Promotional text:** Walk the campground, rate each site out of five, and next
year you will know which one to book.

**Description:**

> Choosing a campsite you have never seen is a gamble. Some are good, some back
> onto the road, and a year later you cannot remember which was which. on-site
> is the notebook for that.
>
> Walk a campground and rate each site out of five. Add a note, a photo, or a
> mark that it is worth booking again. It covers every reservable Ontario Park,
> down to the campgrounds, the individual sites and the trails.
>
> It works with no signal, which is the point, because campground loops are
> where service runs out.
>
> Your notes are yours. Everything stays on your phone. There is no account, no
> advertising and no tracking, and you can export the whole thing to a file and
> load it on another phone.
>
> Also in the app: a map of the parks, favourites, a journal of everything you
> have rated, and French.
>
> Not affiliated with Ontario Parks or the Government of Ontario. Book through
> their official channels.

**Keywords:** ontario,parks,camping,campsite,campground,ratings,journal,
offline,trails,outdoors,review,booking

**Category:** Travel. Secondary: Reference.
