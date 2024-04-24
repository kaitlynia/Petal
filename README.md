![petal-cover](https://github.com/kaitlynia/Petal/assets/38897710/b0197289-1c4c-4e01-aaad-9071e37ce789)
# Petal
Welcome to Petal, **an independent platform for video streaming and text chatting.**

## It's time for a change
Petal doesn't take a cut of your donations. Petal also doesn't force your viewers to watch ads. Petal is free-to-use, open-source, and will remain this way forever.

Petal is currently in alpha and is a proof-of-concept acting as [my own website](https://lynnya.live). If you would like to contribute to this project, please [contact me](https://linkstack.lgbt/@lynnya) for more information.

### Technical information
1. `index.html` contains a webpage with a broadcast viewer ([WHIP](https://datatracker.ietf.org/doc/draft-ietf-wish-whip/) client) + text chat ([WebSockets](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket) client)
2. `server.js` contains a web server implemented with  [Bun.serve()](https://bun.sh/docs/api/http)
3. You must run your own WHEP server (ex. [MediaMTX](https://github.com/bluenviron/mediamtx)) and WHEP client (ex. [OBS 30.1](https://obsproject.com/) or later) in order to use the WHIP viewer.
3. In addition to replying to JSON payloads over WebSockets, the server also listens for POST requests from Ko-fi. In order to verify that the requests are from Ko-fi, you need to set `kofiVerificationToken` in `data.json`.
4. You should also consider updating the following values in `data.json`: `broadcaster, moderators, cert, key, port, passwordSalt, hashIterations, hashBytes, hashDigest`
