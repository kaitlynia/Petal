const WSServer = require('ws').Server
const wss = new WSServer({
  host: '0.0.0.0',
  port: 8080
})
let all = []
wss.on('connection', sock => {
  all.push(sock)
  sock.on('message', msg => {
    all.forEach(s => s.send(msg))
  })
  sock.on('close', () => {
    all = all.filter(s => s != sock)
  })
})