document.addEventListener('DOMContentLoaded', () => {
  const rootURL = window.location.href.split('://', 2)[1].split('/', 2)[0]
  body = document.querySelector('body'),
  messages = document.querySelector('#messages'),
  entry = document.querySelector('#entry'),
  passwordChar = '⬤',
  maxMessageLength = 500,
  sanitize = s => DOMPurify.sanitize(s, sanitizeConfig),
  validName = s => !/[^0-9a-z]/i.test(s),
  validColor = s => {
    const style = new Option().style
    style.color = s
    return !['unset', 'initial', 'inherit', ''].includes(style.color)
  }

  let server = null,
  controlKeyHeld = false,
  tempName = '',
  passwordMode = false,
  typedPassword = '',
  loggedIn = false,
  lastMessageGroup = null,
  sanitizeConfig = {
    ALLOWED_TAGS: ['a', 'b', 'i', 's', 'u', 'br'],
    ALLOWED_ATTR: ['href', 'target', 'rel']
  },
  userData = {
    server: localStorage.getItem('server') || 'chat.lynnya.live',
    token: localStorage.getItem('token') || undefined,
    name: localStorage.getItem('name') || undefined,
    color: localStorage.getItem('color') || undefined,
    textColor: localStorage.getItem('bgColor') || undefined,
    bgColor: localStorage.getItem('bgcolor') || undefined,
    lastUserPrivateMessaged: localStorage.getItem('lastUserPrivateMessaged') || undefined,
    theme: localStorage.getItem('theme') || 'dark',
    scrollThreshold: localStorage.getItem('scrollThreshold') || 100,
    logConnectionEvents: localStorage.getItem('logConnectionEvents') || true,
  },
  avatarImage = document.createElement('img'),
  avatarCanvas = document.createElement('canvas'),
  avatarInput = document.createElement('input')

  avatarCanvas.width = 256
  avatarCanvas.height = 256
  let avatarCanvasContext = avatarCanvas.getContext('2d')
  avatarInput.type = 'file'

  const setUserData = (key, val) => {
    userData[key] = val
    localStorage.setItem(key, val)
  }

  const tryScrollFrom = scrollHeight => {
    if (messages.clientHeight + messages.scrollTop + userData.scrollThreshold >= scrollHeight) {
      messages.scrollTop = messages.scrollHeight
    }
  }

  const addMessage = (text, modifier) => {
    const scrollHeight = messages.scrollHeight
    lastMessageGroup = null

    // NOTE: support optional text/bg colors?
    messages.innerHTML += `<div class="msg${modifier !== undefined ? ' msg--' + modifier : ''}">${text}</div>`

    tryScrollFrom(scrollHeight)
  }

  const addMessageGroup = (payload, messageText) => {
    const scrollHeight = messages.scrollHeight
    lastMessageGroup = payload.name

    messages.innerHTML += `<div class="msg-group" style="background: ${payload.bgColor};"><img class="avatar" src="/avatars/${payload.hasAvatar ? payload.name : 'anon'}.png"><div class="col"><div class="author" style="color: ${payload.nameColor};">${payload.name}</div><div class="msg" style="color: ${payload.textColor};">${messageText}</div></div>`

    tryScrollFrom(scrollHeight)
  }

  const addToLastMessageGroup = (textColor, messageText) => {
    const scrollHeight = messages.scrollHeight

    messages.querySelector('.msg-group:last-of-type > .col').innerHTML += `<div class="msg" style="color: ${textColor};">${messageText}</div>`

    tryScrollFrom(scrollHeight)
  }

  const addHistory = history => {
    for (const message of history) {
      const cleanBody = sanitize(message.body)
      if (lastMessageGroup === null || lastMessageGroup !== message.name) {
        addMessageGroup(message, cleanBody)
      } else (
        addToLastMessageGroup(message.textColor, cleanBody)
      )
    }
  }

  const systemMessage = message => {
    addMessage(message, 'system')
  }

  const processMessage = rawContents => {
    let contents = rawContents

    if (contents instanceof Blob) {
      const reader = new FileReader()

      reader.onload = () => {
        contents = reader.result
      }

      reader.readAsText(contents)
    }

    return sanitize(contents)
      .trim()
      .replaceAll(/\*\*([^]+)\*\*/gm, '<b>$1</b>')
      .replaceAll(/\*([^]+)\*/gm, '<i>$1</i>')
      .replaceAll(/\_\_([^]+)\_\_/gm, '<u>$1</u>')
      .replaceAll(/\~\~([^]+)\~\~/gm, '<s>$1</s>')
      .replaceAll('\n', '<br>')
      .replaceAll(/https?:\/\/[^\s]{2,}/g, '<a href="$&" target="_blank" rel="noopener">$&</a>')
  }

  const cleanURL = url => {
    url = url.replace('wss://', '').replace(':8080', '')
    return url.endsWith('/') ? url.slice(0, -1) : url
  }

  const send = payload => server.send(JSON.stringify(payload))

  const payloadHandlers = {
    'auth-exists': payload => {
      if (userData.token !== undefined) {
        systemMessage('name exists, attempting to log in using the stored token...')
        send({
          type: 'auth-token',
          name: payload.name,
          token: userData.token
        })
      } else {
        entry.value = ''
        passwordMode = true
        systemMessage('name exists, and you have no stored token. please enter your password (enter nothing to cancel)')
      }
    },
    'auth-name-invalid': payload => {
      systemMessage('invalid name. only letters and numbers are allowed.')
    },
    'auth-new': payload => {
      userData.name = payload.name
      userData.token = payload.token
      systemMessage('account created. logging in...')
      send({
        type: 'auth-recv'
      })
    },
    'auth-new-ok': payload => {
      setUserData('name', userData.name)
      setUserData('token', userData.token)
      systemMessage(`logged in as <b>${payload.name}</b>. to maintain account access, use /password`)
      loggedIn = true
      addHistory(payload.history)
      payloadHandlers['participants-ok'](payload)
    },
    'auth-password-ok': payload => {
      setUserData('name', payload.name)
      setUserData('token', payload.token)
      setUserData('color', payload.nameColor)
      setUserData('textColor', payload.textColor)
      setUserData('bgColor', payload.bgColor)
      systemMessage(`logged in as <b style="color: ${payload.nameColor};">${payload.name}</b>`)
      if (!loggedIn) {
        loggedIn = true
        addHistory(payload.history)
        payloadHandlers['participants-ok'](payload)
      }
    },
    'auth-ok': payload => {
      setUserData('name', payload.name)
      setUserData('color', payload.nameColor)
      setUserData('textColor', payload.textColor)
      setUserData('bgColor', payload.bgColor)
      systemMessage(`logged in as <b style="color: ${payload.nameColor};">${payload.name}</b>`)
      if (!loggedIn) {
        loggedIn = true
        addHistory(payload.history)
        payloadHandlers['participants-ok'](payload)
      }
    },
    'auth-fail-password': payload => {
      systemMessage('incorrect password')
    },
    'auth-fail-max-names': payload => {
      systemMessage('you have reached the maximum number of names. (10)')
    },
    'auth-fail-unauthorized': payload => {
      systemMessage('not authorized. if you believe this is an error, please contact lynn')
    },
    'auth-fail-unknown': payload => {
      systemMessage(`login failed (reason: auth_pair missing). if you see this, please contact lynn with details`)
    },
    'participants-ok': payload => {
      systemMessage(`users here now (${payload.participants.length}): ${payload.participants.join(', ')}`)
    },
    'participants-update': payload => {
      systemMessage(`${payload.name} ${payload.action}`)
    },
    'priv-message': payload => {
      const cleanBody = sanitize(payload.body)
      if (cleanBody !== '') {
        // NOTE: use textColor/bgColor here?
        addMessage(`← <b style="color: ${payload.nameColor}";>${payload.name}</b>: ${cleanBody}`, payload.type)
      }
    },
    'priv-message-sent': payload => {
      const cleanBody = sanitize(payload.body)
      if (cleanBody !== '') {
        setUserData('lastUserPrivateMessaged', payload.name)
        // NOTE: use textColor/bgColor here?
        addMessage(`→ <b>${payload.name}</b>: ${cleanBody}`, payload.type)
      }
    },
    'priv-message-fail': payload => {
      systemMessage(`<b>${payload.name}</b> is offline. try again later`)
    },
    'message': payload => {
      const cleanBody = sanitize(payload.body)
      if (cleanBody !== '') {
        if (lastMessageGroup === null || lastMessageGroup !== payload.name) {
          addMessageGroup(payload, cleanBody)
        } else (
          addToLastMessageGroup(payload.textColor, cleanBody)
        )
      }
    },
    'command-password-ok': payload => {
      systemMessage('changed password successfully')
    },
    'command-password-fail': payload => {
      systemMessage('only logged-in users can set a password. use /name to log in')
    },
    'command-color-ok': payload => {
      setUserData('color', payload.color)
      systemMessage(`color changed to <b style="color:${userData.color}">${userData.color}</b>`)
    },
    'command-color-invalid': payload => {
      systemMessage('invalid hex color. examples: #ff9999 (pink), #007700 (dark green), #3333ff (blue)')
    },
    'command-color-auth-required': payload => {
      systemMessage('only logged-in users can use color commands. use /name to log in')
    },
    'command-textcolor-ok': payload => {
      setUserData('textColor', payload.color)
      systemMessage(`text color changed to <b style="color:${userData.textColor}">${userData.textColor}</b>`)
    },
    'command-bgcolor-ok': payload => {
      setUserData('bgColor', payload.color)
      systemMessage(`background color changed to <b style="color:${userData.bgColor}">${userData.bgColor}</b>`)
    },
    'command-names-ok': payload => {
      systemMessage(`names: ${payload.names.join(', ')}`)
    },
    'command-names-fail': payload => {
      systemMessage('you have no names. try /name <name>')
    },
    'avatar-upload-ok': payload => {
      systemMessage('avatar updated')
    },
    'avatar-upload-fail': payload => {
      systemMessage(`invalid avatar (reason: ${payload.reason}). if you are certain the image you uploaded is valid, please contact lynn with the specified error message`)
    },
    'avatar-upload-auth-required': payload => {
      systemMessage('only logged-in users can upload an avatar. use /name to log in')
    }
  }

  const events = {
    onerror: event => {
      if (userData.logConnectionEvents) {
        systemMessage(`failed to connect to ${cleanURL(server.url)}. use /connect to retry or /connect <url>`)
      }
    },
    onclose: event => {
      if (userData.logConnectionEvents) {
        systemMessage(`connection to ${cleanURL(server.url)} closed`)
      }
    },
    onopen: event => {
      if (userData.logConnectionEvents) {
        systemMessage('connected')
      }

      setUserData('server', server.url)

      if (userData.name !== undefined && userData.token !== undefined) {
        send({
          type: 'auth-token',
          name: userData.name,
          token: userData.token
        })
      }
    },
    onmessage: event => {
      const payload = JSON.parse(event.data)
      payloadHandlers[payload.type](payload)
    },
  }

  const connect = url => {
    url = 'wss://'.concat(url.replace('wss://', '').replace('ws://', ''))
    if (url.endsWith('/')) {
      url = url.slice(0, -1)
    }

    if (userData.logConnectionEvents) {
      systemMessage(`connecting to ${cleanURL(url)}...`)
    }
    server = new WebSocket(url)
    Object.assign(server, events)
    return server
  }

  const commands = {
    connect: args => {
      let dest = args
      if (!dest) {
        if (userData.server !== undefined) {
          dest = userData.server
        } else {
          systemMessage(`missing server url. example: /connect ${rootURL}`)
          return -1
        }
      }

      if (server && server.readyState < 3) {
        // connecting or open
        server.onclose = event => {
          events.onclose(event)
          server = connect(dest)
        }
        // close if not already closing
        if (server.readyState !== 2) {
          server.close()
        }
      // unopened or closed (!server || readyState === 3)
      } else {
        server = connect(dest)
      }
      return 1
    },
    help: () => {
      systemMessage(`commands: ${Object.keys(commands).join(', ')}`)
      return 1
    },
    users: () => {
      send({
        type: 'participants'
      })
      return 1
    },
    name: args => {
      if (args) {
        if (validName(args)) {
          tempName = args
          send({
            type: 'auth-name',
            name: args
          })
          return 1
        } else {
          payloadHandlers['auth-name-invalid']()
          return -1
        }
      } else if (userData.name !== undefined) {
        if (userData.color !== undefined) {
          systemMessage(`your name is <b style="color:${userData.color}">${userData.name}</b>`)
          return 1
        } else {
          systemMessage(`your name is <b>${userData.name}</b>`)
          return 1
        }
      } else {
        systemMessage('you have the default name. use /name <name> to set one')
        return -1
      }
    },
    password: args => {
      if (userData.token !== undefined) {
        passwordMode = true
        systemMessage('enter a new password (enter nothing to cancel)')
        return 1
      } else {
        systemMessage('only logged-in users can set a password. use /name to log in')
        return 1
      }
    },
    names: args => {
      if (userData.token !== undefined) {
        send({
          type: 'command-names',
        })
        return 1
      } else {
        payloadHandlers['command-names-fail']()
        return 1
      }
    },
    color: args => {
      if (args) {
        if (validColor(args)) {
          send({
            type: 'command-color',
            color: args
          })
          return 1
        } else {
          payloadHandlers['command-color-invalid']()
          return -1
        }
      } else if (userData.color !== undefined) {
        systemMessage(`your name color is <b style="color: ${userData.color};">${userData.color}</b>`)
        return 1
      } else {
        systemMessage('you have the default name color. use /color <color> (ex. /color #ffaaaa)')
        return -1
      }
    },
    textcolor: args => {
      if (args) {
        if (validColor(args)) {
          send({
            type: 'command-textcolor',
            color: args
          })
          return 1
        } else {
          payloadHandlers['command-color-invalid']()
          return -1
        }
      } else if (userData.textColor !== undefined) {
        systemMessage(`your text color is <b style="color: ${userData.textColor};">${userData.textColor}</b>`)
        return 1
      } else {
        systemMessage('you have the default text color. use /textcolor <color> (ex. /textcolor #ffaaaa)')
        return -1
      }
    },
    bgcolor: args => {
      if (args) {
        if (validColor(args)) {
          send({
            type: 'command-bgcolor',
            color: args
          })
          return 1
        } else {
          payloadHandlers['command-color-invalid']()
          return -1
        }
      } else if (userData.bgColor !== undefined) {
        systemMessage(`your background color is <b style="color: ${userData.bgColor};">${userData.bgColor}</b>`)
        return 1
      } else {
        systemMessage('you have the default background color. use /bgcolor <color> (ex. /bgcolor #ffaaaa)')
        return -1
      }
    },
    avatar: args => {
      avatarInput.click()
      return 1
    },
    w: args => {
      if (args) {
        const spaceIndex = args.search(' ')
        const body = args.slice(spaceIndex)
        if (spaceIndex !== -1 && body.length > 0) {
          send({
            type: 'priv-message',
            name: args.slice(0, spaceIndex),
            body: sanitize(body),
          })
          return 1
        } else {
          systemMessage('missing message content. example: /w exampleUser23 hi!')
          return -1
        }
      } else {
        systemMessage('missing name and message. example: /w exampleUser23 hi!')
        return -1
      }
    },
    c: args => {
      if (userData.lastUserPrivateMessaged === undefined) {
        systemMessage('no previous recipient. example: /w exampleUser23 hi, /c hello again!')
        return -1
      } else if (args && args.length > 1) {
        send({
          type: 'priv-message',
          name: userData.lastUserPrivateMessaged,
          body: sanitize(args),
        })
        return 1
      } else {
        systemMessage('missing message. example: /w exampleUser23 hi, /c hello again!')
        return -1
      }
    },
  }

  const tryCommand = contents => {
    if (contents.charAt(0) === '/') {
      const spaceIndex = contents.search(' ')
      const cmd = spaceIndex !== -1 ? contents.slice(1, spaceIndex) : contents.slice(1)
      if (commands.hasOwnProperty(cmd)) {
        return commands[cmd](spaceIndex !== -1 ? contents.slice(spaceIndex + 1) : null)
      } else {
        systemMessage(`unknown command: ${cmd}`)
        return -1
      }
    }
    return 0
  }

  const processKeyboardEvent = event => {
    if (passwordMode) {
      if (event.key === 'Backspace') {
        typedPassword = typedPassword.slice(0, -1)
        entry.value = entry.value.slice(0, -1)
      } else if (event.key.length < 2)  {
        typedPassword += event.key
        entry.value = passwordChar.repeat(typedPassword.length)
      } else if (event.key === 'Enter') {
        entry.value = ''
        passwordMode = false
        if (typedPassword === '') return systemMessage('password entry cancelled')
        if (userData.token !== undefined) {
          send({
            type: 'command-password',
            token: userData.token,
            password: typedPassword,
          })
        } else {
          send({
            type: 'auth-password',
            name: tempName,
            password: typedPassword,
          })
          tempName = ''
        }
        typedPassword = ''
      }
      event.preventDefault()
      event.stopPropagation()

    } else if (event.key === 'Enter' && !event.shiftKey) {
      // prevent newline character
      event.preventDefault()

      const processedMessage = processMessage(entry.value)

      if (processedMessage !== '') {
        // send command/message
        const commandResult = tryCommand(processedMessage)

        switch (commandResult) {
          case -1:
            break
          case 0:
            if (processedMessage.length <= maxMessageLength) {
              try {
                send({
                  type: 'message',
                  body: processedMessage
                })
                entry.value = ''
              } catch (e) {
                console.log(e)
                systemMessage('failed to send message. use /connect to reconnect or /connect <url>')
              }
            } else {
              systemMessage(`failed to send message. ${processedMessage.length} characters long, max message length is ${maxMessageLength}`)
            }
            break
          case 1:
            entry.value = ''
            break
        }
      }

      // don't trigger this event twice
      event.stopPropagation()
    }
  }

  body.addEventListener('keydown', event => {
    if (event.key === 'Control') {
      controlKeyHeld = true
    } else if (!controlKeyHeld) {
      entry.focus()
      processKeyboardEvent(event)
    }
  })

  body.addEventListener('keyup', event => {
    if (event.key === 'Control') {
      controlKeyHeld = false
    }
  })

  entry.addEventListener('keydown', event => {
    processKeyboardEvent(event)
  })

  entry.addEventListener('mousedown', event => {
    entry.focus()
    if (passwordMode) {
      event.preventDefault()
    }
  })

  avatarImage.addEventListener('load', event => {
    avatarCanvasContext.clearRect(0, 0, avatarCanvas.width, avatarCanvas.height)
    avatarCanvasContext.drawImage(avatarImage, 0, 0, avatarCanvas.width, avatarCanvas.height)

    send({
      type: 'avatar-upload',
      data: avatarCanvas.toDataURL('image/png')
    })
  })

  avatarInput.addEventListener('change', event => {
    avatarImage.src = URL.createObjectURL(avatarInput.files[0])
  })

  /* auto-connect */

  if (userData.server !== undefined) {
    server = connect(userData.server)
  }
})

/* From https://github.com/bluenviron/mediamtx/blob/main/internal/servers/webrtc/read_index.html */
/* MediaMTX is MIT-licensed */

const retryMinute = 60000
const initialRetryDelay = 2000
const retryDelayScalar = 1.5
let retryDelay = initialRetryDelay

const stream = document.getElementById('stream')
const streamInfo = document.getElementById('stream-info')

let pc = null
let offlineSince = null
let restartTimeout = null
let sessionUrl = ''
let offerData = ''
let queuedCandidates = []

const getOfflineTime = delay => {
  const days = delay / 864000000
  if (days >= 1) return `${Math.floor(days)}d`
  const hours = delay / 3600000
  if (hours >= 1) return `${Math.floor(hours)}h`
  const minutes = delay / 60000
  if (minutes >= 1) return `${Math.floor(minutes)}m`
  return `${Math.floor(delay / 1000)}s`
}

const showStreamInfo = str => {
  if (streamInfo !== null) {
    streamInfo.innerText = str
    streamInfo.style = 'display: block;'
  }
}

const unquoteCredential = v => (
	JSON.parse(`"${v}"`)
)

const linkToIceServers = links => (
	(links !== null) ? links.split(', ').map(link => {
		const m = link.match(/^<(.+?)>; rel="ice-server"(; username="(.*?)"; credential="(.*?)"; credential-type="password")?/i)
		const ret = {urls: [m[1]]}

		if (m[3] !== undefined) {
			ret.username = unquoteCredential(m[3])
			ret.credential = unquoteCredential(m[4])
			ret.credentialType = 'password'
		}

		return ret
	}) : []
)

const parseOffer = offer => {
	const ret = {iceUfrag: '', icePwd: '', medias: []}

	for (const line of offer.split('\r\n')) {
		if (line.startsWith('m=')) {
			ret.medias.push(line.slice('m='.length))
		} else if (ret.iceUfrag === '' && line.startsWith('a=ice-ufrag:')) {
			ret.iceUfrag = line.slice('a=ice-ufrag:'.length)
		} else if (ret.icePwd === '' && line.startsWith('a=ice-pwd:')) {
			ret.icePwd = line.slice('a=ice-pwd:'.length)
		}
	}

	return ret
}

const enableStereoOpus = section => {
	let opusPayloadFormat = ''
	let lines = section.split('\r\n')

	for (let line of lines) {
    line = line.toLowerCase()
		if (line.startsWith('a=rtpmap:') && line.includes('opus/')) {
			opusPayloadFormat = `a=fmtp:${line.slice(9).split(' ')[0]} `
			break
		}
	}

	if (opusPayloadFormat === '') {
		return section
	}

	for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
		if (line.startsWith(opusPayloadFormat)) {
			if (!line.includes('stereo')) {
				lines[i] += ';stereo=1'
			}
			if (!line.includes('sprop-stereo')) {
				lines[i] += ';sprop-stereo=1'
			}
		}
	}

	return lines.join('\r\n')
}

const editOffer = (offer) => {
	const sections = offer.sdp.split('m=')

	for (let i = 0; i < sections.length; i++) {
		const section = sections[i]
		if (section.startsWith('audio')) {
			sections[i] = enableStereoOpus(section)
		}
	}

	offer.sdp = sections.join('m=')
}

const generateSdpFragment = (od, candidates) => {
	const candidatesByMedia = {}
	for (const candidate of candidates) {
		const mid = candidate.sdpMLineIndex
		if (candidatesByMedia[mid] === undefined) {
			candidatesByMedia[mid] = []
		}
		candidatesByMedia[mid].push(candidate)
	}

	let frag = `a=ice-ufrag:${od.iceUfrag}\r\na=ice-pwd:${od.icePwd}\r\n`

	for (let mid = 0; mid < od.medias.length; mid++) {
    const candidates = candidatesByMedia[mid]
		if (candidates !== undefined) {
			frag += `m=${od.medias[mid]}\r\na=mid:${mid}\r\n`
			for (const candidate of candidates) {
				frag += `a=${candidate.candidate}\r\n`
			}
		}
	}

	return frag
}

const loadStream = () => {
	requestICEServers()
}

const onError = (err) => {
	if (restartTimeout === null) {
    if (offlineSince === null) {
      offlineSince = Date.now()
    }
		showStreamInfo(`lynnya is offline (${getOfflineTime(Date.now() - offlineSince)})`)

		if (pc !== null) {
			pc.close()
			pc = null
		}

		restartTimeout = window.setTimeout(() => {
			restartTimeout = null
			loadStream()
		}, retryDelay)

    retryDelay = retryDelay * retryDelayScalar

		if (sessionUrl) {
			fetch(sessionUrl, {method: 'DELETE'})
		}
		sessionUrl = ''

		queuedCandidates = []
	}
}

const sendLocalCandidates = (candidates) => {
	fetch(sessionUrl + window.location.search, {
		method: 'PATCH',
		headers: {
			'Content-Type': 'application/trickle-ice-sdpfrag',
			'If-Match': '*',
		},
		body: generateSdpFragment(offerData, candidates),
	})
		.then(res => {
			switch (res.status) {
			case 204:
				break
			case 404:
				showStreamInfo('stream not found')
			default:
				showStreamInfo(`bad status code ${res.status}`)
			}
		})
		.catch(err => {
			onError(err.toString())
		})
}

const onLocalCandidate = (evt) => {
	if (restartTimeout !== null) {
		return
	}

	if (evt.candidate !== null) {
		if (sessionUrl === '') {
			queuedCandidates.push(evt.candidate)
		} else {
			sendLocalCandidates([evt.candidate])
		}
	}
}

const onRemoteAnswer = (sdp) => {
	if (restartTimeout !== null) {
		return
	}

  offlineSince = null
  retryDelay = initialRetryDelay

	pc.setRemoteDescription(new RTCSessionDescription({
		type: 'answer', sdp
	}))

	if (queuedCandidates.length !== 0) {
		sendLocalCandidates(queuedCandidates)
		queuedCandidates = []
	}
}

const sendOffer = (offer) => {
	fetch('https://stream.lynnya.live/whep', {
		method: 'POST',
		headers: {'Content-Type': 'application/sdp'},
		body: offer.sdp,
	})
		.then(res => {
			switch (res.status) {
			case 201:
				break
			case 404:
				throw new Error('stream not found')
			default:
				throw new Error(`bad status code ${res.status}`)
			}
			sessionUrl = new URL(res.headers.get('location'), 'https://stream.lynnya.live').toString()
			return res.text()
		})
		.then(sdp => onRemoteAnswer(sdp))
		.catch(err => onError(err.toString()))
}

const createOffer = () => {
	pc.createOffer()
		.then(offer => {
			editOffer(offer)
			offerData = parseOffer(offer.sdp)
			pc.setLocalDescription(offer)
			sendOffer(offer)
		})
}

const onConnectionState = () => {
	if (restartTimeout !== null) {
		return
	}

	if (pc.iceConnectionState === 'disconnected') {
		onError('peer connection disconnected')
	}
}

const onTrack = (evt) => {
	if (streamInfo !== null) {
    streamInfo.style = ''
	  stream.srcObject = evt.streams[0]
  }
}

const requestICEServers = () => {
	fetch('https://stream.lynnya.live/whep', {method: 'OPTIONS'})
		.then(res => {
			pc = new RTCPeerConnection({
				iceServers: linkToIceServers(res.headers.get('Link')),
				sdpSemantics: 'unified-plan',
			})

			const direction = 'sendrecv'
			pc.addTransceiver('video', { direction })
			pc.addTransceiver('audio', { direction })

			pc.onicecandidate = evt => onLocalCandidate(evt)
			pc.oniceconnectionstatechange = () => onConnectionState()
			pc.ontrack = evt => onTrack(evt)

			createOffer()
		})
		.catch(err => onError(err.toString()))
}

const parseBoolString = (str, defaultVal) => {
	str = (str || '')

	if (['1', 'yes', 'true'].includes(str.toLowerCase())) {
		return true
	}
	if (['0', 'no', 'false'].includes(str.toLowerCase())) {
		return false
	}
	return defaultVal
}

const whepInit = () => {
	loadStream()
}

document.addEventListener('DOMContentLoaded', whepInit)