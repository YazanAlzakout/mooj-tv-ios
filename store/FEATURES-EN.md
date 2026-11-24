# Mooj TV — features

Portfolio copy. English. Every line below is a feature that exists in the shipped
build — nothing here is aspirational, and the phrase "IPTV player" appears nowhere.

---

## One-liner

```
Channels, films and series in one place.
```

## Short paragraph

```
Mooj TV is an Android streaming client for a subscription the viewer already
owns. It arrives empty: the viewer adds their own server, and the app organises
whatever that account carries into one interface — live channels, films and
series — with downloads, a parental lock, six languages and a television build
that runs from the same codebase as the phone.
```

---

## Features

**Browsing**
```
Live channels, films and series in a single interface
Categories for each section, with a search field over every one of them
One search across all three sections at once
A programme guide for live channels
Hide any category from view, per section
```

**Watching**
```
Continue watching, picked up at the exact second it was left
The next episode queued and started automatically
Resume playback across app restarts
Keep playing while the app is in the background
A compact channel view that keeps the picture on screen while browsing
```

**The viewer's own library**
```
Favourites
Watch later
Full watch history
Each kept separately per subscription, so two accounts never mix
```

**Offline**
```
Download films and episodes for offline viewing
Pause, resume and retry a transfer
The catalogue itself is cached, so the app opens and browses without a network
```

**Privacy and control**
```
Parental lock: a PIN, and whole categories hidden behind it
Credentials held in the device's encrypted keystore
No ads, no tracking, no analytics
No server of the developer's own — the app talks only to the server the viewer entered
```

**Reach**
```
Six languages: Arabic, English, French, Turkish, Kurmanji, Sorani
Right-to-left first, with Arabic as the default
Dark theme, light theme, or follow the system
Phone and Android TV, built from one codebase and driven by touch or a remote
```

---

## For the portfolio sidebar

```
Platform    Android phone + Android TV
Stack       React Native · Expo 57 · expo-router · Reanimated 4 · expo-video
Storage     SQLite, with a versioned migration chain
Locales     6, right-to-left first
Themes      Dark / Light / System
```

---

## Wording to avoid

- "IPTV player" — the owner asked for this phrase to stay out.
- Anything suggesting the app supplies content, a catalogue or a subscription.
  It supplies neither; the viewer brings their own account.
- Any channel name, station logo or provider name in copy.
