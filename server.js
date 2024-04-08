const crypto = require('crypto'),
querystring = require('querystring'),
fs = require('fs'),
https = require('https'),
WSServer = require('ws').Server,
createDOMPurify = require('dompurify'),
JSDOM = require('jsdom').JSDOM,

dataPath = './data.json',
UTCDay = 86400000,
getSubTime = () => new Date().setUTCMonth(new Date().getUTCMonth() + 1),

sanitizeConfig = {
  ALLOWED_TAGS: ['a', 'b', 'i', 's', 'u', 'br'],
  ALLOWED_ATTR: ['href', 'target', 'rel']
},
sanitize = s => DOMPurify.sanitize(s, sanitizeConfig),
validName = s => !/[^0-9a-z]/i.test(s),
validHexColor = s => /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(s),

defaultNameColor = '#aaaaaa',
defaultTextColor = '#ffffff',
defaultBgColor = '#202020',
maxMessageLength = 500,
maxMessageHistory = 50,
socks = new Set(),

dailyCurrencyMin = 50,
dailyCurrencyMax = 100,
dailyCurrencySubMin = 50,
dailyCurrencySubMax = 250,
dailyCurrencySubRatio = (dailyCurrencySubMin + dailyCurrencySubMax) / (dailyCurrencyMin + dailyCurrencyMax),
dailyPremiumChance = 0.05,
dailyPremiumSubChance = 0.1,
dollarPerPremiumCurrency = 1

let data = {
  broadcaster: '',
  cert: 'fullchain.pem',
  key: 'privkey.pem',
  port: 8080,
  passwordSalt: 'salt',
  hashIterations: 10000,
  hashBytes: 64,
  hashDigest: 'sha512',
  dailyRevenue: {},
  dailySubs: {},
  dailyDonations: {},
  kofiVerificationToken: '',
  kofiToken: {},
  kofiSubTime: {},
  kofiSubStreak: {},
  kofiMonthsSubbed: {},
  kofiSubsTotal: {},
  kofiDonations: {},
  kofiTotal: {},
  tokenKofi: {},
  tokenNames: {},
  tokenHash: {},
  tokenStats: {},
  tokenInventory: {},
  nameToken: {},
  nameColor: {},
  nameTextColor: {},
  nameBgColor: {},
  nameAvatar: {},
  messageHistory: [],
  messageHistoryIndex: 0
}

const saveData = () => {
  fs.writeFileSync(dataPath, JSON.stringify(data))
}

if (fs.existsSync(dataPath)) {
  data = JSON.parse(fs.readFileSync(dataPath, 'utf8'))
}

const updateDailyRevenue = (isSub, amount) => {
  const date = new Date()
  const dateKey = `${date.getUTCFullYear()}-${('0'+date.getUTCMonth()).slice(-2)}-${('0'+date.getUTCDate()).slice(-2)}`
  if (isSub) {
    data.dailySubs[dateKey] = (data.dailySubs[dateKey] || 0) + 1
  } else {
    data.dailyDonations[dateKey] = (data.dailyDonations[dateKey] || 0) + donation
  }
  data.dailyRevenue[dateKey] = (data.dailyRevenue[dateKey] || 0) + amount
}

const awardPremiumUsingTotal = (token, total) => {
  if (data.tokenStats[token] === undefined) {
    data.tokenStats[token] = {}
  }
  const stats = data.tokenStats[token]
  const claimed = stats.premiumCurrencyClaimed || 0
  const award = ~~((total - claimed) / dollarPerPremiumCurrency)
  const currency = stats.premiumCurrency || 0
  const currencyEarned = stats.premiumCurrencyEarned || 0
  Object.assign(stats, {
    premiumCurrencyClaimed: claimed + award,
    premiumCurrency: currency + award,
    premiumCurrencyEarned: currencyEarned + award
  })
  return award
}

const isSubscribed = token => {
  return token === data.broadcaster || Date.now() < data.kofiSubTime[data.tokenKofi[token]]
}

const timeUntilNextDay = time => {
  let nextDay = new Date(time)
  nextDay.setUTCDate(nextDay.getUTCDate() + 1)
  return Date.UTC(nextDay.getUTCFullYear(), nextDay.getUTCMonth(), nextDay.getUTCDate()) - Date.now()
}

const sockSend = (sock, payload) => sock.send(JSON.stringify(payload))
const tryTokenSend = (token, payload) => {
  const sock = [...socks].find(s => s.token === token)
  if (sock !== undefined) sockSend(sock, payload)
}

const kofiHandler = payload => {
  if (payload['verification_token'] === data.kofiVerificationToken) {
    const kofi = payload['email']
    const isSub = payload['type'] === 'Subscription'
    const amount = Number(payload['amount'])

    if (isSub) {
      data.kofiSubTime[kofi] = getSubTime()
      data.kofiMonthsSubbed[kofi] = (data.kofiMonthsSubbed[kofi] || 0) + 1
      data.kofiSubsTotal[kofi] = (data.kofiSubsTotal[kofi] || 0) + amount
      if (payload['is_first_subscription_payment']) {
        data.kofiSubStreak[kofi] = 1
      } else {
        data.kofiSubStreak[kofi] = (data.kofiSubStreak[kofi] || 0) + 1
      }
    } else {
      data.kofiDonations[kofi] = (data.kofiDonations[kofi] || 0) + amount
    }

    data.kofiTotal[kofi] = (data.kofiTotal[kofi] || 0) + amount
    const token = data.kofiToken[kofi]
    if (token !== undefined) {
      const award = awardPremiumUsingTotal(token, data.kofiTotal[kofi])
      tryTokenSend(token, {
        type: 'kofi-action',
        amount: award,
        method: isSub ? 'sub' : 'donation',
      })
    }

    updateDailyRevenue(isSub, amount)
    saveData()
  }
}

const window = new JSDOM('').window
const DOMPurify = createDOMPurify(window)
const https_server = https.createServer({
  cert: fs.readFileSync(data.cert),
  key: fs.readFileSync(data.key),
}, (req, res) => {
  if (req.method === 'POST') {
    req.on('data', data => {
      const payload = JSON.parse(querystring.parse(data.toString()).data)
      res.writeHead(200)
      res.end()
      kofiHandler(payload)
    })
  }
})
https_server.listen(data.port)

const wss = new WSServer({
  server: https_server
})

const updateParticipants = (sock, action) => {
  const participantsStr = JSON.stringify({
    type: 'participants-update',
    name: sock.name,
    action: action
  });
  [...socks].filter(s => s.name !== sock.name).forEach(s => s.send(participantsStr))
}

const authToken = (sock, token, name, newName=false) => {
  const names = data.tokenNames[token]
  if (newName && names.length === 10) {
    sock.send(JSON.stringify({
      type: 'auth-fail-max-names'
    }))
  } else if (names !== undefined && (names.includes(name) || newName)) {
    const action = sock.name === 'anon' ? 'joined' : 'changed name to ' + name
    sock.token = token
    sock.name = name
    sock.nameColor = data.nameColor[name] || defaultNameColor
    if (isSubscribed(token)) {
      sock.textColor = data.nameTextColor[name] || defaultTextColor
      sock.bgColor = data.nameBgColor[name] || defaultBgColor
    } else {
      sock.textColor = defaultTextColor
      sock.bgColor = defaultBgColor
    }
    if (newName) {
      data.nameToken[name] = token
      names.push(sock.name)
      saveData()
    }
    sock.send(JSON.stringify({
      type: 'auth-ok',
      name: sock.name,
      nameColor: sock.nameColor,
      textColor: sock.textColor,
      bgColor: sock.bgColor,
      history: getHistory(),
      participants: getParticipants()
    }))
    updateParticipants(sock, action)
  } else {
    sock.send(JSON.stringify({
      type: 'auth-fail-unauthorized'
    }))
  }
}

const hashPassword = (password, callback) => {
  crypto.pbkdf2(password, data.passwordSalt, data.hashIterations, data.hashBytes, data.hashDigest,
    (err, derivedKey) => {
      if (err) throw err
      callback(derivedKey.toString('hex'))
    }
  )
}

const getParticipants = () => [...socks].map(s => s.name)
const getHistory = () => {
  return data.messageHistory.slice(data.messageHistoryIndex).concat(...data.messageHistory.slice(0, data.messageHistoryIndex))
}

const payloadHandlers = {
  'auth-name': (sock, payload) => {
    if (payload.name === 'anon' || data.nameToken[payload.name] !== undefined) {
      // name already exists, notify client
      sockSend(sock, {
        type: 'auth-exists',
        name: payload.name
      })
    } else if (validName(payload.name)) {
      if (sock.token !== undefined) {
        authToken(sock, sock.token, payload.name, true)
      } else {
        sock.auth_pair = {
          name: payload.name,
          token: crypto.randomUUID()
        }
        sockSend(sock, {
          type: 'auth-new',
          name: payload.name,
          token: sock.auth_pair.token
        })
      }
    } else {
      sockSend(sock, {
        type: 'auth-name-invalid'
      })
    }
  },
  'auth-token': (sock, payload) => {
    authToken(sock, payload.token, payload.name)
  },
  'auth-password': (sock, payload) => {
    if (payload.hasOwnProperty('name') && payload.hasOwnProperty('password')) {
      hashPassword(payload.password, hash => {
        const token = data.nameToken[payload.name]
        if (data.tokenHash[token] === hash) {
          sock.token = token
          sock.name = payload.name
          sock.nameColor = data.nameColor[sock.name] || defaultNameColor
          if (isSubscribed(token)) {
            sock.textColor = data.nameTextColor[sock.name] || defaultTextColor
            sock.bgColor = data.nameBgColor[sock.name] || defaultBgColor
          } else {
            sock.textColor = defaultTextColor
            sock.bgColor = defaultBgColor
          }
          sockSend(sock, {
            type: 'auth-password-ok',
            token: sock.token,
            name: sock.name,
            nameColor: sock.nameColor,
            textColor: sock.textColor,
            bgColor: sock.bgColor,
            history: getHistory(),
            participants: getParticipants()
          })
          updateParticipants(sock, 'joined')
        } else {
          sockSend(sock, {
            type: 'auth-fail-password',
            name: payload.name
          })
        }
      })
    }
  },
  'auth-recv': (sock, payload) => {
    if (sock.auth_pair !== undefined) {
      sock.name = sock.auth_pair.name
      data.nameToken[sock.name] = sock.auth_pair.token
      data.tokenNames[sock.auth_pair.token] = [sock.name]
      delete sock.auth_pair
      saveData()

      sockSend(sock, {
        type: 'auth-new-ok',
        name: sock.name,
        history: getHistory(),
        participants: getParticipants()
      })
      updateParticipants(sock, 'joined as a new user (say hi!)')
    } else {
      sockSend(sock, {
        type: 'auth-fail-unknown'
      })
    }
  },
  'avatar-upload': (sock, payload) => {
    if (sock.token !== undefined) {
      fs.writeFile(`/var/www/html/avatars/${sock.name}.png`, payload.data.replace('data:image/png;base64,', ''), 'base64', err => {
        if (err) {
          sockSend(sock, {
            type: 'avatar-upload-fail',
            reason: err.toString()
          })
        } else {
          data.nameAvatar[sock.name] = true
          saveData()

          sockSend(sock, {
            type: 'avatar-upload-ok'
          })
        }
      })
    } else {
      sockSend(sock, {
        type: 'avatar-upload-auth-required'
      })
    }
  },
  'participants': (sock, payload) => {
    sockSend(sock, {
      type: 'participants-ok',
      participants: [...socks].map(s => s.name)
    })
  },
  'priv-message': (sock, payload) => {
    if (payload.hasOwnProperty('body') && payload.hasOwnProperty('name')) {
      const user = [...socks].find(s => s.name === payload.name)
      if (user !== undefined) {
        const body = sanitize(payload.body)
        if (isSubscribed(sock.token)) {
          sock.textColor = data.nameTextColor[sock.name] || defaultTextColor
          sock.bgColor = data.nameBgColor[sock.name] || defaultBgColor
        } else {
          sock.textColor = defaultTextColor
          sock.bgColor = defaultBgColor
        }
        user.send(JSON.stringify({
          type: 'priv-message',
          name: sock.name,
          nameColor: sock.nameColor,
          textColor: sock.textColor,
          bgColor: sock.bgColor,
          body: body
        }))
        sockSend(sock, {
          type: 'priv-message-sent',
          name: payload.name,
          nameColor: sock.nameColor,
          textColor: sock.textColor,
          bgColor: sock.bgColor,
          body: body
        })
      } else {
        sockSend(sock, {
          type: 'priv-message-fail',
          name: payload.name,
        })
      }
    }
  },
  'message': (sock, payload) => {
    if (payload.hasOwnProperty('body')) {
      const cleanBody = sanitize(payload.body)

      if (cleanBody.length > maxMessageLength) return

      if (isSubscribed(sock.token)) {
        sock.textColor = data.nameTextColor[sock.name] || defaultTextColor
        sock.bgColor = data.nameBgColor[sock.name] || defaultBgColor
      } else {
        sock.textColor = defaultTextColor
        sock.bgColor = defaultBgColor
      }

      const message = {
        type: 'message',
        hasAvatar: data.nameAvatar[sock.name] !== undefined,
        name: sock.name,
        nameColor: sock.nameColor,
        textColor: sock.textColor,
        bgColor: sock.bgColor,
        body: cleanBody
      }

      data.messageHistory[data.messageHistoryIndex] = message

      if (data.messageHistoryIndex + 1 >= maxMessageHistory) {
        data.messageHistoryIndex = 0
      } else {
        data.messageHistoryIndex += 1
      }
      saveData()

      const messageStr = JSON.stringify(message)

      socks.forEach(s => s.send(messageStr))
    }
  },
  'command-password': (sock, payload) => {
    if (sock.token !== undefined && payload.hasOwnProperty('password')) {
      hashPassword(payload.password, hash => {
        data.tokenHash[sock.token] = hash
        saveData()
        sockSend(sock, {
          type: 'command-password-ok'
        })
      })
    } else {
      sockSend(sock, {
        type: 'command-password-auth-required'
      })
    }
  },
  'command-kofi': (sock, payload) => {
    if (sock.token !== undefined && payload.hasOwnProperty('kofi')) {
      const newKofi = payload.kofi
      const existingToken = data.kofiToken[newKofi]
      if (existingToken !== undefined && sock.token !== existingToken) {
        return sockSend(sock, {
          type: 'command-kofi-auth-fail'
        })
      }
      const currentKofi = data.tokenKofi[sock.token]
      data.tokenKofi[sock.token] = newKofi
      data.kofiToken[newKofi] = sock.token
      delete data.kofiToken[currentKofi]

      const currentSubTime = data.kofiSubTime[currentKofi] || 0
      const newSubTime = data.kofiSubTime[newKofi] || 0

      if (currentSubTime !== 0 || newSubTime !== 0) {
        data.kofiMonthsSubbed[newKofi] = (data.kofiMonthsSubbed[currentKofi] || 0) + (data.kofiMonthsSubbed[newKofi] || 0)
        delete data.kofiMonthsSubbed[currentKofi]
        data.kofiSubsTotal[newKofi] = (data.kofiSubsTotal[currentKofi] || 0) + (data.kofiSubsTotal[newKofi] || 0)
        delete data.kofiSubsTotal[currentKofi]

        const newSubLatest = newSubTime > currentSubTime
        data.kofiSubTime[newKofi] = newSubLatest ? newSubTime : currentSubTime
        delete data.kofiSubTime[currentKofi]

        const currentSubDate = new Date(currentSubTime)
        const currentStreak = data.kofiSubStreak[currentKofi] || 0
        const newSubDate = new Date(newSubTime)
        const newStreak = data.kofiSubStreak[currentKofi] || 0
        let streak = newSubLatest ? newStreak : currentStreak

        if (newSubLatest && currentSubTime > 0) {
          if (newSubTime - currentSubDate.setUTCMonth(currentSubDate.getUTCMonth() + newStreak) <= UTCDay) {
            streak += currentStreak
          }
        } else if (!newSubLatest && newSubTime > 0) {
          if (currentSubTime - newSubDate.setUTCMonth(newSubDate.getUTCMonth() + currentStreak) <= UTCDay) {
            streak += newStreak
          }
        }

        data.kofiSubStreak[newKofi] = streak
        delete data.kofiSubStreak[currentKofi]
      }

      data.kofiDonations[newKofi] = (data.kofiDonations[currentKofi] || 0) + (data.kofiDonations[newKofi] || 0)
      delete data.kofiDonations[currentKofi]

      data.kofiTotal[newKofi] = (data.kofiTotal[currentKofi] || 0) + (data.kofiTotal[newKofi] || 0)
      delete data.kofiTotal[currentKofi]

      const award = awardPremiumUsingTotal(sock.token, data.kofiTotal[newKofi])
      saveData()

      sockSend(sock, {
        type: 'command-kofi-ok',
        sub: isSubscribed(sock.token),
        premiumCurrency: award,
      })
    } else {
      sockSend(sock, {
        type: 'command-kofi-auth-required'
      })
    }
  },
  'command-names': (sock, payload) => {
    const names = data.tokenNames[sock.token]
    if (names !== undefined) {
      sockSend(sock, {
        type: 'command-names-ok',
        names: names
      })
    } else {
      sockSend(sock, {
        type: 'command-names-fail'
      })
    }
  },
  'command-color': (sock, payload) => {
    if (payload.hasOwnProperty('color')) {
      if (sock.token !== undefined) {
        if (validHexColor(payload.color)) {
          sock.nameColor = payload.color
          data.nameColor[sock.name] = sock.nameColor
          saveData()

          sockSend(sock, {
            type: 'command-color-ok',
            color: sock.nameColor
          })
        } else {
          sockSend(sock, {
            type: 'command-color-invalid'
          })
        }
      } else {
        sockSend(sock, {
          type: 'command-color-auth-required'
        })
      }
    }
  },
  'command-textcolor': (sock, payload) => {
    if (payload.hasOwnProperty('color')) {
      if (sock.token !== undefined) {
        if (isSubscribed(sock.token)) {
          if (validHexColor(payload.color)) {
            sock.textColor = payload.color
            data.nameTextColor[sock.name] = sock.textColor
            saveData()

            sockSend(sock, {
              type: 'command-textcolor-ok',
              color: sock.textColor
            })
          } else {
            sockSend(sock, {
              type: 'command-color-invalid'
            })
          }
        } else {
          sockSend(sock, {
            type: 'command-color-sub-required'
          })
        }
      } else {
        sockSend(sock, {
          type: 'command-color-auth-required'
        })
      }
    }
  },
  'command-bgcolor': (sock, payload) => {
    if (payload.hasOwnProperty('color')) {
      if (sock.token !== undefined) {
        if (isSubscribed(sock.token)) {
          if (validHexColor(payload.color)) {
            sock.bgColor = payload.color
            data.nameBgColor[sock.name] = sock.bgColor
            saveData()

            sockSend(sock, {
              type: 'command-bgcolor-ok',
              color: sock.bgColor
            })
          } else {
            sockSend(sock, {
              type: 'command-color-invalid'
            })
          }
        } else {
          sockSend(sock, {
            type: 'command-color-sub-required'
          })
        }
      } else {
        sockSend(sock, {
          type: 'command-color-auth-required'
        })
      }
    }
  },
  'command-daily': (sock, payload) => {
    if (sock.token !== undefined) {
      if (data.tokenStats[sock.token] === undefined) {
        data.tokenStats[sock.token] = {}
      }
      const stats = data.tokenStats[sock.token]
      const delta = timeUntilNextDay(stats.dailyTime || 0)

      if (delta <= 0) {
        const sub = isSubscribed(sock.token)
        const min = sub ? dailyCurrencySubMin : dailyCurrencyMin
        const max = sub ? dailyCurrencySubMax : dailyCurrencyMax
        const currency = ~~(Math.random() * (max - min) + min)
        const premiumChance = sub ? dailyPremiumSubChance : dailyPremiumChance
        const gotPremium = Math.random() < premiumChance

        stats.dailyTime = Date.now()
        stats.currency = (stats.currency || 0) + currency
        if (sub) {
          stats.currencyEarnedFromSub = (stats.currencyEarnedFromSub || 0) + ~~(currency / dailyCurrencySubRatio)
        }
        stats.currencyEarned = (stats.currencyEarned || 0) + currency
        if (gotPremium) {
          stats.premiumCurrencyEarned = (stats.premiumCurrencyEarned || 0) + 1
          stats.premiumCurrencyEarned = (stats.premiumCurrencyEarned || 0) + 1
        }

        saveData()
        sockSend(sock, {
          type: 'command-daily-ok',
          sub: sub,
          currency: currency,
          premiumCurrency: gotPremium ? 1 : 0,
          time: timeUntilNextDay(stats.dailyTime)
        })
      } else {
        sockSend(sock, {
          type: 'command-daily-fail',
          time: delta
        })
      }
    } else {
      sockSend(sock, {
        type: 'command-daily-auth-required'
      })
    }
  },
  'command-stats': (sock, payload) => {
    if (sock.token !== undefined) {
      sockSend(sock, {
        type: 'command-stats-ok',
        stats: data.tokenStats[sock.token] || {},
        view: payload.view || 'stats'
      })
    } else {
      sockSend(sock, {
        type: 'command-stats-auth-required'
      })
    }
  },
}

wss.on('connection', sock => {
  socks.add(sock)
  sock.name = 'anon'
  sock.nameColor = defaultNameColor
  sock.textColor = defaultTextColor
  sock.bgColor = defaultBgColor

  sock.on('message', msg => {
    const payload = JSON.parse(msg)
    payloadHandlers[payload.type](sock, payload)
  })

  sock.on('close', () => {
    socks.delete(sock)
    if (sock.token !== undefined) {
      updateParticipants(sock, 'left')
    }
  })
})