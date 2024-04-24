const crypto = require('crypto'),
querystring = require('querystring'),
fs = require('fs'),
JSDOM = require('jsdom').JSDOM,
window = new JSDOM('').window,
createDOMPurify = require('dompurify'),
DOMPurify = createDOMPurify(window),

dataPath = './data.json',
UTCDay = 86400000,
getSubTime = () => new Date().setUTCMonth(new Date().getUTCMonth() + 1),

sanitizeConfig = {
  ALLOWED_TAGS: ['a', 'b', 'i', 's', 'u', 'br'],
  ALLOWED_ATTR: ['href', 'target', 'rel']
},
sanitize = s => DOMPurify.sanitize(s, sanitizeConfig),
validName = s => s.length > 0 && !/[^0-9a-z]/i.test(s),
validHexColor = s => s.length === 7 && /#[0-9a-f]{6}/i.test(s),

defaultNameColor = '#aaaaaa',
defaultTextColor = '#ffffff',
defaultBgColor = '#202020',
maxMessageLength = 500,
maxMessageHistory = 50,
maxMessageLookup = 1000,
socks = new Set(),

dailyCurrencyMin = 50,
dailyCurrencyMax = 100,
dailyCurrencySubMin = 50,
dailyCurrencySubMax = 250,
dailyCurrencySubRatio = (dailyCurrencySubMin + dailyCurrencySubMax) / (dailyCurrencyMin + dailyCurrencyMax),
dailyPremiumChance = 0.1,
dailyPremiumSubChance = 0.2,
dollarPerPremiumCurrency = 1

let data = {
  broadcaster: '',
  moderators: [],
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
  nameBio: {},
  messageHistory: [],
  messageHistoryIndex: 0
}

const saveData = () => {
  fs.writeFileSync(dataPath, JSON.stringify(data))
}

if (fs.existsSync(dataPath)) {
  data = JSON.parse(fs.readFileSync(dataPath, 'utf8'))
}

const messageLookup = new Map([...data.messageHistory.map(message => {
  return [message.id, {
    token: message.token,
    name: message.name
  }]
})])

const luminance = hex => {
  a = hh => {
    v = parseInt(hh, 16) / 255
    return v <= 0.03928
      ? v / 12.92
      : Math.pow((v + 0.055) / 1.055, 2.4)
  }
  return a(hex.slice(1,3)) * 0.2126 + a(hex.slice(3,5)) * 0.7152 + a(hex.slice(5,7)) * 0.0722
}

const textBackgroundContrast = (text, background) => {
  if (text === background) {
    return {good: false, ratio: 1, reason: 'Text and background are the same color'}
  }
  const lum1 = luminance(text)
  const lum2 = luminance(background)
  const ratio = (Math.max(lum1, lum2) + 0.05) / (Math.min(lum1, lum2) + 0.05)

  if (ratio >= 4.5) {
    return {good: true, ratio: ratio, reason: 'good'}
  } else if (lum1 > lum2) {
    if (lum1 / 2 < 0.5) {
      return {good: false, ratio: ratio, reason: 'Text color is too dark'}
    } else {
      return {good: false, ratio: ratio, reason: 'Background color is too dark'}
    }
  } else {
    if (lum2 / 2 < 0.5) {
      return {good: false, ratio: ratio, reason: 'Background color is too light'}
    } else {
      return {good: false, ratio: ratio, reason: 'Text color is too light'}
    }
  }
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

const hasPetalPlus = token => {
  return token === data.broadcaster || Date.now() < data.kofiSubTime[data.tokenKofi[token]]
}

const updateSockColors = sock => {
  if (hasPetalPlus(sock.token)) {
    sock.nameColor = data.nameColor[sock.name] || defaultNameColor
    sock.textColor = data.nameTextColor[sock.name] || defaultTextColor
    sock.bgColor = data.nameBgColor[sock.name] || defaultBgColor
  } else {
    const nameColor = data.nameColor[sock.name]
    if (nameColor !== undefined) {
      sock.nameColor = textBackgroundContrast(nameColor, defaultBgColor).good ? nameColor : defaultNameColor
    } else {
      sock.nameColor = defaultNameColor
    }
    sock.textColor = defaultTextColor
    sock.bgColor = defaultBgColor
  }
}

const aggregateKofiData = token => {
  // TODO: condense kofi data into a single object
  // (large implications including re-test of integration)
  const kofi = data.tokenKofi[token]
  if (kofi === undefined) {
    return {
      subStatus: hasPetalPlus(token),
      subTime: 0,
      subStreak: 0,
      monthsSubbed: 0,
      subsTotal: 0,
      donations: 0,
      total: 0,
    }
  } else {
    return {
      subStatus: hasPetalPlus(token),
      subTime: data.kofiSubTime[kofi] || 0,
      subStreak: data.kofiSubStreak[kofi] || 0,
      monthsSubbed: data.kofiMonthsSubbed[kofi] || 0,
      subsTotal: data.kofiSubsTotal[kofi] || 0,
      donations: data.kofiDonations[kofi] || 0,
      total: data.kofiTotal[kofi] || 0,
    }
  }
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

const timeUntilNextDay = time => {
  let nextDay = new Date(time)
  nextDay.setUTCDate(nextDay.getUTCDate() + 1)
  return Date.UTC(nextDay.getUTCFullYear(), nextDay.getUTCMonth(), nextDay.getUTCDate()) - Date.now()
}

const isModerator = token => {
  return token === data.broadcaster || data.moderators.includes(token)
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
    updateSockColors(sock)
    if (newName) {
      data.nameToken[name] = token
      names.push(sock.name)
      saveData()
    }
    sockSend(sock, {
      type: 'auth-ok',
      name: sock.name,
      nameColor: sock.nameColor,
      textColor: sock.textColor,
      bgColor: sock.bgColor,
      avatar: data.nameAvatar[sock.name] || 'anon.png',
      bio: data.nameBio[sock.name] || '',
      stats: data.tokenStats[sock.token] || {},
      kofi: aggregateKofiData(sock.token),
      moderator: isModerator(sock.token)
    })
    updateParticipants(sock, action)
  } else {
    sock.send(JSON.stringify({
      type: 'auth-fail-unauthorized'
    }))
  }
}

const handleColorsPayload = (sock, payload) => {
  if (!hasPetalPlus(sock.token) && (payload.textColor !== defaultTextColor || payload.bgColor !== defaultBgColor)) {
    sockSend(sock, {
      type: 'command-profile-sub-required',
      view: payload.view,
    })
    return false
  }

  if (![payload.nameColor, payload.textColor, payload.bgColor].every(c => validHexColor(c))) {
    sockSend(sock, {
      type: 'command-colors-invalid',
      view: payload.view,
    })
    return false
  }

  const name = textBackgroundContrast(payload.nameColor, payload.bgColor)
  if (name.good) {
    const message = textBackgroundContrast(payload.textColor, payload.bgColor)
    if (message.good) {
      return true
    } else {
      sockSend(sock, {
        type: 'command-colors-fail',
        reason: message.reason.replace('Text', 'Message'),
        view: payload.view,
      })
      return false
    }
  } else {
    sockSend(sock, {
      type: 'command-colors-fail',
      reason: name.reason.replace('Text', 'Name'),
      view: payload.view,
    })
    return false
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
  const rawHistory = data.messageHistory.slice(data.messageHistoryIndex).concat(...data.messageHistory.slice(0, data.messageHistoryIndex))
  return rawHistory.map(message => {
    return {
      id: message.id,
      avatar: data.nameAvatar[message.name] || 'anon.png',
      name: message.name,
      nameColor: data.nameColor[message.name] || defaultNameColor,
      textColor: hasPetalPlus(message.token) ? data.nameTextColor[message.name] || defaultTextColor : defaultTextColor,
      bgColor: hasPetalPlus(message.token) ? data.nameBgColor[message.name] || defaultBgColor : defaultBgColor,
      body: message.body,
    }
  })
}

const server = Bun.serve({
  port: data.port,
  tls: {
    key: Bun.file(data.key),
    cert: Bun.file(data.cert),
  },
  fetch(req, server) {
    if (req.method === 'POST') {
      req.on('data', data => {
        const payloadStr = querystring.parse(data.toString()).data
        if (payloadStr !== undefined) {
          kofiHandler(JSON.parse(payloadStr))
        }
        return new Response(null, {status: 200})
      })
    } else {
      server.upgrade(req)
    }
  },
  websocket: {
    open(sock) {
      sock.subscribe('message')
      socks.add(sock)
      sock.name = 'anon'
      sock.nameColor = defaultNameColor
      sock.textColor = defaultTextColor
      sock.bgColor = defaultBgColor
      sockSend(sock, {
        type: 'hello',
        history: getHistory(),
        participants: getParticipants()
      })
    },
    close(sock, code, message) {
      socks.delete(sock)
      if (sock.token !== undefined) {
        updateParticipants(sock, 'left')
      }
    },
    drain(sock) {},
    message(sock, message) {
      const payload = JSON.parse(message)
      payloadHandlers[payload.type](sock, payload)
    },
  }
})

const payloadHandlers = {
  'auth-name': (sock, payload) => {
    if (payload.name === 'anon' || data.nameToken[payload.name] !== undefined) {
      // name already exists, notify client
      sockSend(sock, {
        type: 'auth-exists',
        name: payload.name,
        view: payload.view,
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
          token: sock.auth_pair.token,
          view: payload.view,
        })
      }
    } else {
      sockSend(sock, {
        type: 'auth-name-invalid',
        view: payload.view,
      })
    }
  },
  'auth-token': (sock, payload) => {
    authToken(sock, payload.token, payload.name)
  },
  'auth-password': (sock, payload) => {
    if (payload.name !== undefined && payload.password !== undefined) {
      hashPassword(payload.password, hash => {
        const token = data.nameToken[payload.name]
        if (data.tokenHash[token] === hash) {
          sock.token = token
          sock.name = payload.name
          updateSockColors(sock)
          sockSend(sock, {
            type: 'auth-password-ok',
            token: sock.token,
            name: sock.name,
            nameColor: sock.nameColor,
            textColor: sock.textColor,
            bgColor: sock.bgColor,
            avatar: data.nameAvatar[sock.name] || 'anon.png',
            bio: data.nameBio[sock.name] || '',
            stats: data.tokenStats[sock.token] || {},
            kofi: aggregateKofiData(sock.token),
            moderator: isModerator(sock.token),
            view: payload.view,
          })
          updateParticipants(sock, 'joined')
        } else {
          sockSend(sock, {
            type: 'auth-fail-password',
            name: payload.name,
            view: payload.view,
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
      const avatar = crypto.randomUUID() + '.png'
      fs.writeFile(`/var/www/html/avatars/${avatar}`, payload.data.replace('data:image/png;base64,', ''), 'base64', err => {
        if (err) {
          sockSend(sock, {
            type: 'avatar-upload-fail',
            reason: err.toString(),
            view: payload.view
          })
        } else {
          const oldAvatar = data.nameAvatar[sock.name]
          if (oldAvatar !== undefined) {
            fs.unlink(`/var/www/html/avatars/${oldAvatar}`, (err) => {
              if (err) throw err
            })
          }
          data.nameAvatar[sock.name] = avatar
          saveData()

          sockSend(sock, {
            type: 'avatar-upload-ok',
            avatar: avatar,
          })
        }
      })
    } else {
      sockSend(sock, {
        type: 'avatar-upload-auth-required',
        view: payload.view
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
    if (payload.body !== undefined && payload.name !== undefined) {
      const user = [...socks].find(s => s.name === payload.name)
      if (user !== undefined) {
        const body = sanitize(payload.body)
        updateSockColors(sock)
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
    if (payload.body !== undefined) {
      const cleanBody = sanitize(payload.body)

      if (cleanBody.length > maxMessageLength) return
      updateSockColors(sock)

      const message = {
        type: 'message',
        id: crypto.randomUUID(),
        avatar: data.nameAvatar[sock.name] || 'anon.png',
        name: sock.name,
        nameColor: sock.nameColor,
        textColor: sock.textColor,
        bgColor: sock.bgColor,
        body: cleanBody
      }

      messageLookup.set(message.id, {
        token: sock.token || null,
        name: sock.name
      })
      if (messageLookup.size > maxMessageLookup) {
        messageLookup.delete(messageLookup.keys().next().value)
      }
      data.messageHistory[data.messageHistoryIndex] = {id: message.id, token: sock.token, name: sock.name, body: cleanBody}

      if (data.messageHistoryIndex + 1 >= maxMessageHistory) {
        data.messageHistoryIndex = 0
      } else {
        data.messageHistoryIndex += 1
      }
      saveData()

      const messageStr = JSON.stringify(message)

      server.publish('message', messageStr)
    }
  },
  'bio': (sock, payload) => {
    if (sock.token !== undefined && payload.bio !== undefined) {
      const bio = data.nameBio[sock.name] = sanitize(payload.bio)
      saveData()

      sockSend(sock, {
        type: 'bio-ok',
        bio: bio
      })
    } else {
      sockSend(sock, {
        type: 'bio-auth-required'
      })
    }
  },
  'profile-from-message': (sock, payload) => {
    if (payload.id !== undefined && messageLookup.has(payload.id)) {
      const message = messageLookup.get(payload.id)
      sockSend(sock, {
        type: 'user-profile',
        avatar: data.nameAvatar[message.name] || 'anon.png',
        name: message.name,
        nameColor: data.nameColor[message.name],
        textColor: data.nameTextColor[message.name],
        bgColor: data.nameBgColor[message.name],
        bio: data.nameBio[message.name] || ''
      })
    }
  },
  'command-password': (sock, payload) => {
    if (sock.token !== undefined && payload.password !== undefined) {
      hashPassword(payload.password, hash => {
        data.tokenHash[sock.token] = hash
        saveData()
        sockSend(sock, {
          type: 'command-password-ok',
          view: payload.view,
        })
      })
    } else {
      sockSend(sock, {
        type: 'command-password-auth-required',
        view: payload.view,
      })
    }
  },
  'command-kofi': (sock, payload) => {
    if (sock.token !== undefined && payload.kofi !== undefined) {
      const newKofi = payload.kofi
      const existingToken = data.kofiToken[newKofi]
      if (existingToken !== undefined && sock.token !== existingToken) {
        return sockSend(sock, {
          type: 'command-kofi-auth-fail',
          view: payload.view,
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
        stats: data.tokenStats[sock.token] || {},
        kofi: aggregateKofiData(sock.token),
        award: award,
        view: payload.view,
      })
    } else {
      sockSend(sock, {
        type: 'command-kofi-auth-required',
        view: payload.view,
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
    if (payload.color !== undefined) {
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
            type: 'command-colors-invalid',
            view: 'command',
          })
        }
      } else {
        sockSend(sock, {
          type: 'command-colors-auth-required',
          view: 'command',
        })
      }
    }
  },
  'command-textcolor': (sock, payload) => {
    if (payload.color !== undefined) {
      if (sock.token !== undefined) {
        if (hasPetalPlus(sock.token)) {
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
              type: 'command-colors-invalid',
              view: 'command',
            })
          }
        } else {
          sockSend(sock, {
            type: 'command-colors-sub-required',
            view: 'command',
          })
        }
      } else {
        sockSend(sock, {
          type: 'command-colors-auth-required',
          view: 'command',
        })
      }
    }
  },
  'command-bgcolor': (sock, payload) => {
    if (payload.color !== undefined) {
      if (sock.token !== undefined) {
        if (hasPetalPlus(sock.token)) {
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
              type: 'command-colors-invalid',
              view: 'command',
            })
          }
        } else {
          sockSend(sock, {
            type: 'command-colors-sub-required',
            view: 'command',
          })
        }
      } else {
        sockSend(sock, {
          type: 'command-colors-auth-required',
          view: 'command',
        })
      }
    }
  },
  'command-colors': (sock, payload) => {
    const valid = handleColorsPayload(sock, payload)
    if (valid) {
      data.nameColor[sock.name] = payload.nameColor
      data.nameTextColor[sock.name] = payload.textColor
      data.nameBgColor[sock.name] = payload.bgColor
      saveData()
    }
  },
  'command-profile': (sock, payload) => {
    if (sock.token !== undefined) {
      if (payload.name !== undefined && validName(payload.name)) {
        if (payload.name !== sock.name && data.nameToken[payload.name] !== undefined) {
          sockSend(sock, {
            type: 'auth-exists',
            name: payload.name,
            view: payload.view,
          })
        } else {
          const valid = handleColorsPayload(sock, payload)
          if (valid) {
            if (payload.name !== sock.name) {
              delete data.nameToken[sock.name]
              data.nameToken[payload.name] = sock.token
              data.tokenNames[sock.token] = [...data.tokenNames[sock.token].filter(n => n !== sock.name), payload.name]
              data.nameAvatar[payload.name] = data.nameAvatar[sock.name]
              delete data.nameAvatar[sock.name]
            }
            delete data.nameColor[sock.name]
            sock.nameColor = data.nameColor[payload.name] = payload.nameColor
            delete data.nameTextColor[sock.name]
            sock.textColor = data.nameTextColor[payload.name] = payload.textColor
            delete data.nameBgColor[sock.name]
            sock.bgColor = data.nameBgColor[payload.name] = payload.bgColor
            data.nameBio[payload.name] = data.nameBio[sock.name]
            delete data.nameBio[sock.name]
            sock.name = payload.name

            if (sock.name !== payload.name) {
              data.messageHistory.forEach(message => {
                if (sock.name === message.name) {
                  message.name = payload.name
                }
              })
            }

            sockSend(sock, {
              type: 'command-profile-ok',
              avatar: data.nameAvatar[payload.name] || 'anon.png',
              name: payload.name,
              nameColor: payload.nameColor,
              textColor: payload.textColor,
              bgColor: payload.bgColor,
              view: payload.view,
            })

            sock.name = payload.name
            saveData()
          }
        }
      } else {
        sockSend(sock, {
          type: 'command-profile-invalid-name',
          view: payload.view,
        })
      }
    } else {
      sockSend(sock, {
        type: 'command-profile-auth-required',
        view: payload.view,
      })
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
        const sub = hasPetalPlus(sock.token)
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
          stats.premiumCurrency = (stats.premiumCurrency || 0) + 1
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
        kofi: aggregateKofiData(sock.token),
        statsView: payload.statsView || 'stats'
      })
    } else {
      sockSend(sock, {
        type: 'command-stats-auth-required'
      })
    }
  },
  'command-delete-message': (sock, payload) => {
    if (isModerator(sock.token) && payload.id !== undefined) {
      data.messageHistory.forEach(message => {
        if (payload.id === message.id) {
          message.body = '[message deleted]'
        }
      })
      saveData()

      const messageStr = JSON.stringify({
        type: 'delete-message',
        id: payload.id
      })
      socks.forEach(s => s.send(messageStr))
    }
  },
  'command-addmod': (sock, payload) => {
    if (sock.token === data.broadcaster) {
      if (payload.name !== undefined) {
        const token = data.nameToken[payload.name]
        if (token !== undefined) {
          data.moderators.push(token)
          saveData()

          sockSend(sock, {
            type: 'command-addmod-ok',
            name: payload.name
          })
        }
      }
    } else {
      sockSend(sock, {
        type: 'command-unauthorized'
      })
    }
  },
  'command-data': (sock, payload) => {
    if (sock.token === data.broadcaster) {
      if (payload.data !== '') {
        sockSend(sock, {
          type: 'command-data-ok',
          data: data[payload.data]
        })
      }
    } else {
      sockSend(sock, {
        type: 'command-unauthorized'
      })
    }
  }
}