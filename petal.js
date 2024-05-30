'use strict';

document.addEventListener('DOMContentLoaded', () => {

const rootURL = window.location.href.split('://', 2)[1].split('/', 2)[0],
body = document.getElementById('main'),
stream = document.getElementById('stream'),
messages = document.getElementById('messages'),
messageContextMenu = document.getElementById('messageContextMenu'),
profilePopover = document.getElementById('profilePopover'),
profilePopoverAvatar = document.getElementById('profilePopoverAvatar'),
profilePopoverName = document.getElementById('profilePopoverName'),
profilePopoverBio = document.getElementById('profilePopoverBio'),
streamInfo = document.getElementById('stream-info'),
streamInfoMenu = document.getElementById('streamInfoMenu'),
entry = document.getElementById('entry'),
backToLatest = document.getElementById('backToLatest'),
petal = document.getElementById('petal'),
menu = document.getElementById('menu'),
menuTabs = document.querySelectorAll('.menuTab'),
menuDataElements = {
  name: document.querySelector('[data-profile-name]'),
  avatar: document.querySelector('[data-profile-avatar]'),
  message: document.querySelector('[data-profile-message]'),
  background: document.querySelector('[data-profile-background]'),
  profileInfo: document.querySelector('[data-profile-info]'),
  bio: document.querySelector('[data-profile-bio]'),
  bioInfo: document.querySelector('[data-bio-info]'),
  currency: document.querySelector('[data-stats-currency]'),
  premiumCurrency: document.querySelector('[data-stats-premium-currency]'),
  currencyEarned: document.querySelector('[data-stats-currency-earned]'),
  currencyEarnedFromSub: document.querySelector('[data-stats-currency-earned-from-sub]'),
  premiumCurrencyEarned: document.querySelector('[data-stats-premium-currency-earned]'),
  premiumCurrencyClaimed: document.querySelector('[data-stats-premium-currency-claimed]'),
  subStatus: document.querySelector('[data-stats-sub-status]'),
  subOnly: document.querySelector('[data-stats-sub-only]'),
  subTime: document.querySelector('[data-stats-sub-time]'),
  subStreak: document.querySelector('[data-stats-sub-streak]'),
  monthsSubbed: document.querySelector('[data-stats-months-subbed]'),
  subsTotal: document.querySelector('[data-stats-subs-total]'),
  donations: document.querySelector('[data-stats-donations]'),
  kofiTotal: document.querySelector('[data-stats-kofi-total]'),
  passwordInfo: document.querySelector('[data-password-info]'),
  kofiInfo: document.querySelector('[data-kofi-info]'),
  messageScrollThreshold: document.querySelector('[data-message-scroll-threshold]'),
  streamHistory: document.querySelector('[data-stream-history]'),
},
changeAvatar = document.getElementById('changeAvatar'),
editNameIcon = document.getElementById('editNameIcon'),
nameColorInput = document.getElementById('nameColor'),
messageColorInput = document.getElementById('messageColor'),
backgroundColorInput = document.getElementById('backgroundColor'),
nameColorButton = document.getElementById('changeNameColor'),
messageColorButton = document.getElementById('changeMessageColor'),
backgroundColorButton = document.getElementById('changeBackgroundColor'),
saveProfile = document.getElementById('saveProfile'),
resetProfile = document.getElementById('resetProfile'),
enterPasswordInput = document.getElementById('enterPassword'),
saveBio = document.getElementById('saveBio'),
changePasswordInput = document.getElementById('changePassword'),
confirmPasswordInput = document.getElementById('confirmPassword'),
savePassword = document.getElementById('savePassword'),
kofiInput = document.getElementById('kofi'),
saveKofi = document.getElementById('saveKofi'),
showConnectionEvents = document.getElementById('showConnectionEvents'),
autoReconnect = document.getElementById('autoReconnect'),
messageScrollThreshold = document.getElementById('messageScrollThreshold'),
clickAction = window.innerWidth > 768 ? 'Click' : 'Tap',
shortMonthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
passwordChar = '⬤',
currencyEmoji = '&#x1F33A;',
currencyName = 'Petal',
premiumCurrencyEmoji = '&#x1F338;',
premiumCurrencyName = 'Blossom',
maxMessageLength = 500,
maxBioLength = 500,
maxBioLines = 5,
sanitize = s => DOMPurify.sanitize(s, sanitizeConfig),
validName = s => s.length > 0 && !/[^0-9a-z]/i.test(s),
validHexColor = s => s.length === 7 && /#[0-9a-f]{6}/i.test(s),
validEmail = s => /[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?/.test(s)

const streamPage = stream !== null,
numMenuTabs = menuTabs.length

let server = null,
reconnectInterval = -1,
controlKeyHeld = false,
escapeKeyHeld = false,
tempName = '',
passwordMode = false,
entryPassword = '',
menuPassword = '',
menuKofi = '',
streamTitleString = '',
streamHistoryArray = [],
historyAdded = false,
loggedIn = false,
lastMessageGroup = null,
messageContextMenuOpen = false,
profilePopoverOpen = false,
streamInfoMenuOpen = false,
menuOpen = false,
sanitizeConfig = {
  ALLOWED_TAGS: ['a', 'b', 'i', 's', 'u', 'br'],
  ALLOWED_ATTR: ['href', 'target', 'rel']
},
lastColorOpen = null,
colorisConfig = {
  theme: 'pill',
  themeMode: 'dark',
  alpha: false,
  focusInput: false,
  margin: 36,
},
data = {
  server: localStorage.getItem('server') || 'chat.lynnya.live',
  token: localStorage.getItem('token') || undefined,
  name: localStorage.getItem('name') || undefined,
  color: localStorage.getItem('color') || undefined,
  textColor: localStorage.getItem('bgColor') || undefined,
  bgColor: localStorage.getItem('bgcolor') || undefined,
  moderator: localStorage.getItem('moderator') === 'true',
  lastUserPrivateMessaged: localStorage.getItem('lastUserPrivateMessaged') || undefined,
  theme: localStorage.getItem('theme') || 'dark',
  messageScrollThreshold: Number(localStorage.getItem('messageScrollThreshold') || 250),
  showConnectionEvents: localStorage.getItem('showConnectionEvents') !== 'false',
  autoReconnect: localStorage.getItem('autoReconnect') !== 'false',
},
avatarImage = document.createElement('img'),
avatarCanvas = document.createElement('canvas'),
avatarInput = document.createElement('input')

avatarCanvas.width = 256
avatarCanvas.height = 256
let avatarCanvasContext = avatarCanvas.getContext('2d')
avatarInput.type = 'file'

const setData = (key, val) => {
  data[key] = val
  localStorage.setItem(key, val)
}

const luminance = (hex) => {
  const a = hh => {
    const v = parseInt(hh, 16) / 255
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  }
  return a(hex.slice(1,3)) * 0.2126 + a(hex.slice(3,5)) * 0.7152 + a(hex.slice(5,7)) * 0.0722
}

const rgbToHex = rgb => {
  if (rgb.charAt(0) === '#') return rgb
  return '#' + rgb.replace('rgb(', '').replace(')', '').split(',').map(s => ('0'+Number(s).toString(16)).slice(-2)).join('')
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

const formatSubTime = subTime => {
  const date = new Date(subTime)
  return `${shortMonthNames[date.getUTCMonth()]} ${date.getUTCDate()}`
}

const resetMenu = () => {
  // the following 4 lines should execute first for security reasons
  menuPassword = ''
  savePassword.classList.add('hidden')
  changePasswordInput.value = ''
  confirmPasswordInput.value = ''
  // end security lines
  resetProfile.click()
  menuDataElements.passwordInfo.classList.add('hidden')
  kofiInput.value = ''
  menuDataElements.kofiInfo.classList.add('hidden')
  saveKofi.classList.add('hidden')
}

const handleMenuProfileInfo = (error, noReset = false) => {
  saveProfile.classList.add('hidden')
  if (!noReset) resetProfile.classList.remove('hidden')
  menuDataElements.profileInfo.classList.remove('good')
  menuDataElements.profileInfo.innerText = error
  menuDataElements.profileInfo.classList.remove('hidden')
}

const handleMenuProfileOK = message => {
  resetProfile.classList.add('hidden')
  saveProfile.classList.add('hidden')
  menuDataElements.profileInfo.classList.add('good')
  menuDataElements.profileInfo.innerText = message
  menuDataElements.profileInfo.classList.remove('hidden')
}

const checkColors = (nameColor, textColor, bgColor) => {
  const name = textBackgroundContrast(nameColor, bgColor)
  if (name.good) {
    const message = textBackgroundContrast(textColor, bgColor)
    if (message.good) {
      return message
    } else {
      message.reason = message.reason.replace('Text', 'Message')
      return message
    }
  } else {
    name.reason = name.reason.replace('Text', 'Name')
    return name
  }
}

const changeAvatarOnClick = event => avatarInput.click()
const menuNameOnClick = event => {
  menuDataElements.name.innerText = ''
  menuDataElements.name.contentEditable = 'true'
  menuDataElements.name.focus()
}

const checkProfile = () => {
  const name = menuDataElements.name.innerText
  const color = rgbToHex(menuDataElements.name.style.color)
  const textColor = rgbToHex(menuDataElements.message.style.color)
  const bgColor = rgbToHex(menuDataElements.background.style.backgroundColor)

  if (name === (data.name || 'anon') && color === data.color && textColor === data.textColor && bgColor === data.bgColor) {
    menuDataElements.profileInfo.classList.add('hidden')
    menuDataElements.profileInfo.innerText = ''
    saveProfile.classList.add('hidden')
    resetProfile.classList.add('hidden')
    return false
  } else if (validName(name)) {
    const colorResult = checkColors(color, textColor, bgColor)
    if (colorResult.good) {
      menuDataElements.profileInfo.classList.add('hidden')
      menuDataElements.profileInfo.innerText = ''
      saveProfile.classList.remove('hidden')
      resetProfile.classList.remove('hidden')
      return true
    } else {
      handleMenuProfileInfo(colorResult.reason)
      return false
    }
  } else {
    handleMenuProfileInfo('Invalid name, letters/numbers only')
    return false
  }
}

const handleColorsPayload = payload => {
  setData('color', payload.nameColor)
  menuDataElements.name.style.color = payload.nameColor
  nameColorInput.value = payload.nameColor
  setData('textColor', payload.textColor)
  menuDataElements.message.style.color = payload.textColor
  messageColorInput.value = payload.textColor
  entry.style.color = payload.textColor
  setData('bgColor', payload.bgColor)
  menuDataElements.background.style.backgroundColor = payload.bgColor
  menuDataElements.background.style.fill = payload.nameColor
  menuDataElements.background.style.stroke = payload.nameColor
  backgroundColorInput.value = payload.bgColor
  entry.style.backgroundColor = payload.bgColor
}

const handleStatsData = stats => {
  menuDataElements.currency.innerText = stats.currency || 0
  menuDataElements.premiumCurrency.innerText = stats.premiumCurrency || 0
  menuDataElements.currencyEarned.innerText = stats.currencyEarned || 0
  menuDataElements.currencyEarnedFromSub.innerText = stats.currencyEarnedFromSub || 0
  menuDataElements.premiumCurrencyEarned.innerText = stats.premiumCurrencyEarned || 0
  menuDataElements.premiumCurrencyClaimed.innerText = stats.premiumCurrencyClaimed || 0
}

const handleKofiData = kofi => {
  if (kofi.subStatus) {
    backgroundColorButton.classList.remove('hidden')
    messageColorButton.classList.remove('hidden')
    menuDataElements.subStatus.innerText = 'active'
    menuDataElements.subTime.innerText = formatSubTime(kofi.subTime)
    menuDataElements.subStreak.innerText = kofi.subStreak
    menuDataElements.subOnly.classList.remove('hidden')
  } else {
    messageColorButton.classList.add('hidden')
    backgroundColorButton.classList.add('hidden')
    menuDataElements.subStatus.innerText = 'inactive'
    menuDataElements.subOnly.classList.add('hidden')
    menuDataElements.subTime.innerText = ''
    menuDataElements.subStreak.innerText = ''
  }
  menuDataElements.monthsSubbed.innerText = kofi.monthsSubbed || 0
  menuDataElements.subsTotal.innerText = kofi.subsTotal || 0
  menuDataElements.donations.innerText = kofi.donations || 0
  menuDataElements.kofiTotal.innerText = kofi.kofiTotal || 0
}

const handleProfileData = payload => {
  setData('name', payload.name)
  menuDataElements.name.innerText = payload.name
  menuDataElements.avatar.src = `/avatars/${payload.avatar}`
  nameColorButton.classList.remove('hidden')
  handleColorsPayload(payload)
  setData('bio', payload.bio)
  menuDataElements.bio.value = payload.bio
  handleStatsData(payload.stats)
  handleKofiData(payload.kofi)
}

const tryScrollFrom = scrollHeight => {
  if (messages.clientHeight + messages.scrollTop + data.messageScrollThreshold >= scrollHeight) {
    messages.scrollTop = messages.scrollHeight
    return true
  }
  return false
}

const addMessage = (text, modifier, id) => {
  const scrollHeight = messages.scrollHeight
  lastMessageGroup = null
  const idText = id !== undefined ? `id="msg-${id}" `: ''

  messages.innerHTML += `<div ${idText}class="msg${modifier !== undefined ? ' msg--' + modifier : ''}">${text}</div>`

  tryScrollFrom(scrollHeight)
}

const addMessageGroup = (message, messageText) => {
  const scrollHeight = messages.scrollHeight
  lastMessageGroup = message.name
  const idText = message.id !== undefined ? `id="msg-${message.id}" `: ''

  messages.innerHTML += `<div class="msg-group" style="color: ${message.textColor}; background: ${message.bgColor};"><img class="avatar" draggable="false" src="/avatars/${message.avatar}"><div class="col"><div class="author" style="color: ${message.nameColor};">${message.name}</div><div ${idText}class="msg" style="color: ${message.textColor};">${messageText}</div></div>`

  tryScrollFrom(scrollHeight)
}

const addToLastMessageGroup = (message, messageText) => {
  const scrollHeight = messages.scrollHeight
  const idText = message.id !== undefined ? `id="msg-${message.id}" `: ''

  messages.querySelector('.msg-group:last-of-type > .col').innerHTML += `<div ${idText}class="msg">${messageText}</div>`

  tryScrollFrom(scrollHeight)
}

const addHistory = history => {
  for (const message of history) {
    if (lastMessageGroup === null || lastMessageGroup !== message.name) {
      addMessageGroup(message, message.body)
    } else (
      addToLastMessageGroup(message, message.body)
    )
  }
}

const systemMessage = message => {
  addMessage(message, 'system')
}

const toggleMenu = () => {
  menuOpen = menu.classList.contains('hidden')
  menuOpen ? menu.classList.remove('hidden') : menu.classList.add('hidden')
  if (!menuOpen) {
    resetMenu()
  }
}

const toggleMenuTab = tab => {
  if (!tab.classList.contains('active')) {
    resetMenu()
    document.querySelectorAll('.menuTab').forEach(t => t.classList.remove('active'))
    tab.classList.add('active')
    document.querySelectorAll('.menuPage').forEach(p => p.classList.remove('active'))
    document.getElementById(tab.dataset.page).classList.add('active')
  }
}

const clearMessageContextMenu = () => {
  messageContextMenuOpen = false
  messageContextMenu.classList.add('hidden')
  messageContextMenu.dataset.id = ''
}

const processText = content => {
  return sanitize(content)
    .trim()
    .replaceAll(/\*\*([^]+)\*\*/gm, '<b>$1</b>')
    .replaceAll(/\*([^]+)\*/gm, '<i>$1</i>')
    .replaceAll(/\~\~([^]+)\~\~/gm, '<s>$1</s>')
    .replaceAll(/\_\_([^]+)\_\_/gm, '<u>$1</u>')
    .replaceAll('\n', '<br>')
    .replaceAll(/https?:\/\/[^\s]{2,}/g, '<a href="$&" target="_blank" rel="noopener">$&</a>')
}

const cleanURL = url => {
  url = url.replace('wss://', '').replace(':8080', '')
  return url.endsWith('/') ? url.slice(0, -1) : url
}

const formatTimeDelta = delta => {
  let str = ''

  const days = delta / 86400000
  if (days >= 1) {
    str += ` ${Math.floor(days)}d`
    delta %= 86400000
  }

  const hours = delta / 3600000
  if (hours >= 1) {
    str += ` ${Math.floor(hours)}h`
    delta %= 3600000
  }

  const minutes = delta / 60000
  if (minutes >= 1) {
    str += ` ${Math.floor(minutes)}m`
    delta %= 60000
  }

  str += ` ${Math.floor(delta / 1000)}s`
  return str.slice(1)
}

const send = payload => server.send(JSON.stringify(payload))

const payloadHandlers = {
  'hello': payload => {
    // payloadHandlers['participants-ok'](payload)
    streamTitleString = payload.title
    if (streamPage) {
      streamTitle.innerHTML = streamTitleString
      streamHistoryArray = payload.streamHistory
    }

    if (historyAdded) return
    historyAdded = true
    addHistory(payload.history)

    if (data.name === undefined || data.token === undefined) {
      localStorage.removeItem('name')
      localStorage.removeItem('token')
      delete data.name
      delete data.token
      systemMessage(
        `Welcome to Petal! You are currently anonymous.<br><br>

        Register an account:<ol>
        <li>${clickAction} on the Petal icon below</li>
        <li>${clickAction} on the name "anon"</li>
        <li>Enter your name</li>
        <li>${clickAction} "Save"</li>
        <li>${clickAction} "Settings" to change your password.<br><b>Required in order to log in using a different browser/device.</b></li></ol><br>

        Log in:<ol>
        <li>Repeat steps 1-4 above</li>
        <li>Enter your password</li>
        <li>${clickAction} "Submit"</li></ol><br>`
      )
    }
  },
  'auth-exists': payload => {
    if (data.token !== undefined && data.name === payload.name) {
      systemMessage('name exists, attempting to log in using the stored token...')
      send({
        type: 'auth-token',
        name: payload.name,
        token: data.token
      })
    } else {
      if (payload.view === 'command') {
        entry.value = ''
        passwordMode = true
        entry.focus()
        systemMessage('name exists, please enter your password (enter nothing to cancel)')
      } else if (payload.view === 'menu') {
        menuDataElements.name.removeEventListener('click', menuNameOnClick)
        menuDataElements.name.classList.add('cursor-inherit')
        enterPasswordInput.classList.remove('hidden')
        saveProfile.innerText = 'Submit'
        resetProfile.innerText = 'Cancel'
        saveProfile.classList.remove('hidden')
        resetProfile.classList.remove('hidden')
      }
    }
  },
  'auth-name-invalid': payload => {
    payloadHandlers['command-profile-invalid-name'](payload)
  },
  'auth-new': payload => {
    data.name = payload.name
    data.token = payload.token
    if (payload.view === 'command') {
      systemMessage('account created. logging in...')
    }
    send({
      type: 'auth-recv',
      view: payload.view,
    })
  },
  'auth-new-ok': payload => {
    setData('token', data.token)
    setData('name', payload.name)
    changeAvatar.addEventListener('click', changeAvatarOnClick)
    menuDataElements.name.innerText = payload.name
    nameColorButton.classList.remove('hidden')
    loggedIn = true
    if (payload.view === 'command') {
      systemMessage(`logged in. please set a password by accessing the Petal menu, then Settings`)
    } else if (payload.view === 'menu') {
      handleMenuProfileOK('Logged in, please set a password in Settings')
    }
  },
  'auth-password-ok': payload => {
    setData('token', payload.token)
    changeAvatar.addEventListener('click', changeAvatarOnClick)
    handleProfileData(payload)
    handleStatsData(payload.stats)
    handleKofiData(payload.kofi)
    setData('moderator', payload.moderator)
    if (!loggedIn) {
      loggedIn = true
      if (payload.view === 'command') {
        systemMessage(`logged in as <b style="color: ${payload.nameColor};">${payload.name}</b>`)
      } else if (payload.view === 'menu') {
        handleMenuProfileOK('Logged in')
        menuDataElements.name.addEventListener('click', menuNameOnClick)
        editNameIcon.addEventListener('click', menuNameOnClick)
        menuDataElements.name.classList.remove('cursor-inherit')
      }
    } else if (payload.view === 'command') {
      systemMessage(`logged in as <b style="color: ${payload.nameColor};">${payload.name}</b>`)
    }
  },
  'auth-ok': payload => {
    changeAvatar.addEventListener('click', changeAvatarOnClick)
    changeAvatar.classList.remove('cursor-inherit')
    handleProfileData(payload)
    handleStatsData(payload.stats)
    handleKofiData(payload.kofi)
    setData('moderator', payload.moderator)
    systemMessage(`logged in as <b style="color: ${payload.nameColor};">${payload.name}</b>`)
  },
  'auth-fail-password': payload => {
    if (payload.view === 'command') {
      systemMessage('incorrect password')
    } else if (payload.view === 'menu') {
      handleMenuProfileInfo('Incorrect password', true)
      menuDataElements.name.innerText = data.name || 'anon'
      menuDataElements.name.classList.remove('cursor-inherit')
      menuDataElements.name.addEventListener('click', menuNameOnClick)
      editNameIcon.addEventListener('click', menuNameOnClick)
    }
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
    const names = [...new Set(payload.participants)]
    const counts = names.map(n => {
      const count = payload.participants.filter(m => m === n).length
      return count === 1 ? n : `${n} [${count}]`
    })
    systemMessage(`${names.length} user${names.length === 1 ? '' : 's'} connected: ${counts.join(', ')}`)
  },
  'participants-update': payload => {
    // TODO: implement UI for participants
    // systemMessage(`${payload.name} ${payload.action}`)
  },
  'priv-message': payload => {
    const cleanBody = sanitize(payload.body)
    if (cleanBody !== '') {
      addMessage(`← <b style="color: ${payload.nameColor}";>${payload.name}</b>: ${cleanBody}`, payload.type)
    }
  },
  'priv-message-sent': payload => {
    const cleanBody = sanitize(payload.body)
    if (cleanBody !== '') {
      setData('lastUserPrivateMessaged', payload.name)
      systemMessage(`→ <b>${payload.name}</b>: ${cleanBody}`, payload.type)
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
  'delete-message': payload => {
    const message = document.getElementById(`msg-${payload.id}`)
    if (message !== null) {
      message.innerText = '[message deleted]'
    }
  },
  'title': payload => {
    streamTitleString = payload.title
    streamTitle.innerHTML = streamTitleString
  },
  'stream-history': payload => {
    streamHistoryArray = payload.history
  },
  'user-profile': payload => {
    profilePopoverAvatar.src = `/avatars/${payload.avatar}`
    profilePopoverName.innerText = payload.name
    profilePopoverName.style.color = payload.nameColor
    profilePopoverBio.style.color = payload.textColor
    profilePopover.style.backgroundColor = payload.bgColor
    profilePopoverBio.innerHTML = processText(payload.bio) || '<div class="no-bio"></div>'
    profilePopover.classList.remove('hidden')
    
    if (Number(profilePopover.style.top.replace('px', '')) > (window.innerHeight/2)){
      
      profilePopover.style.top = (Number(profilePopover.style.top.replace('px', '')) -profilePopover.offsetHeight) + 'px'}
    profilePopover.style.left = Math.min(window.innerWidth - profilePopover.offsetWidth, Number(profilePopover.style.left.replace('px', ''))) + 'px'
    
    profilePopoverOpen = true

  },
  'bio-auth-required': payload => {
    menuDataElements.bioInfo.innerText = 'Change name before writing bio'
    menuDataElements.bioInfo.classList.add('bad')
    menuDataElements.bioInfo.classList.remove('hidden')
  },
  'bio-ok': payload => {
    setData('bio', payload.bio)
    menuDataElements.bioInfo.innerText = 'Saved'
    menuDataElements.bioInfo.classList.remove('bad')
    menuDataElements.bioInfo.classList.remove('hidden')
  },
  'command-unauthorized': payload => {
    systemMessage('you are not authorized to use this command.')
  },
  'command-kofi-auth-fail': payload => {
    if (payload.view === 'command') {
      systemMessage('this Ko-fi email has already been claimed. if you believe this is an error, please contact lynn')
    } else if (payload.view === 'view') {
      menuDataElements.kofiInfo.classList.remove('good')
      menuDataElements.kofiInfo.innerText = 'Email claimed by another user'
      menuDataElements.kofiInfo.classList.remove('hidden')
    }
  },
  'command-kofi-auth-required': payload => {
    if (payload.view === 'command') {
      systemMessage('only named users can set a Ko-fi email. use /name to name yourself')
    } else if (payload.view === 'menu') {
      menuDataElements.kofiInfo.classList.remove('good')
      menuDataElements.kofiInfo.innerText = 'Change name before changing email'
      menuDataElements.kofiInfo.classList.remove('hidden')
    }
  },
  'command-kofi-ok': payload => {
    const premiumText = payload.award > 0 ? `, +<b>${payload.award}</b>${premiumCurrencyEmoji}` : ''
    if (payload.view === 'command') {
      systemMessage(`changed Ko-fi email successfully. status: ${payload.kofi.subStatus ? '' : 'not '}subscribed${premiumText}`)
    } else if (payload.view === 'menu') {
      menuDataElements.kofiInfo.classList.add('good')
      menuDataElements.kofiInfo.innerText = `Saved${premiumText}`
      menuDataElements.kofiInfo.classList.remove('hidden')
      handleStatsData(payload.stats)
      handleKofiData(payload.kofi)
    }
  },
  'kofi-action': payload => {
    const premiumText = payload.premiumCurrency > 0 ? ` +<b>${payload.premiumCurrency}</b>${premiumCurrencyEmoji}` : ''
    systemMessage(`thanks for the ${payload.method}!${premiumText}`)
  },
  'command-password-auth-required': payload => {
    if (payload.view === 'command') {
      systemMessage('only named users can set a password. use /name to log in')
    } else if (payload.view === 'menu') {
      menuDataElements.passwordInfo.classList.remove('good')
      menuDataElements.passwordInfo.innerText = 'Change name before changing password'
      menuDataElements.passwordInfo.classList.remove('hidden')
    }
  },
  'command-password-ok': payload => {
    if (payload.view === 'command') {
      systemMessage('changed password successfully')
    } else if (payload.view === 'menu') {
      menuDataElements.passwordInfo.classList.add('good')
      menuDataElements.passwordInfo.innerText = 'Saved'
      menuDataElements.passwordInfo.classList.remove('hidden')
    }
  },
  'command-color-ok': payload => {
    setData('color', payload.color)
    systemMessage(`color changed to <b style="color:${data.color}">${data.color}</b>`)
  },
  'command-textcolor-ok': payload => {
    setData('textColor', payload.color)
    systemMessage(`text color changed to <b style="color:${data.textColor}">${data.textColor}</b>`)
  },
  'command-bgcolor-ok': payload => {
    setData('bgColor', payload.color)
    systemMessage(`background color changed to <b style="color:${data.bgColor}">${data.bgColor}</b>`)
  },
  'command-profile-invalid-name': payload => {
    if (payload.view === 'command') {
      systemMessage('invalid name, only letters and numbers are allowed.')
    } else if (payload.view === 'menu') {
      handleMenuProfileInfo('Invalid name, letters/numbers only')
    }
  },
  'command-profile-auth-required': payload => {
    if (payload.view === 'command') {
      systemMessage('only named users can change their name color, and only Ko-fi subscribers can change text/background colors. use /name to name yourself')
    } else if (payload.view === 'menu') {
      handleMenuProfileInfo('Change name before changing colors')
    }
  },
  'command-profile-sub-required': payload => {
    if (payload.view === 'command') {
      systemMessage('only users with a linked Ko-fi subscription can change text/background colors. use /kofi to link your email if you are already subbed')
    } else if (payload.view === 'menu') {
      handleMenuProfileInfo('Update Ko-fi email in Settings first')
    }
  },
  'command-colors-invalid': payload => {
    if (payload.view === 'command') {
      systemMessage('invalid hex color. examples: #ff9999 (pink), #007700 (dark green), #3333ff (blue)')
    } else if (payload.view === 'menu') {
      handleMenuProfileInfo('Invalid hex color')
    }
  },
  'command-colors-fail': payload => {
    if (payload.view === 'command') {
      systemMessage(`Colors are not contrasted enough, ${payload.reason.toLowerCase()}`)
    } else if (payload.view === 'menu') {
      handleMenuProfileInfo(payload.reason)
    }
  },
  'command-profile-ok': payload => {
    setData('name', payload.name)
    menuDataElements.name.innerText = payload.name
    menuDataElements.avatar.src = `/avatars/${payload.avatar}`
    handleColorsPayload(payload)
    if (payload.view === 'command') {
      systemMessage(`changed profile to name: ${payload.name}, color: ${payload.nameColor}, text: ${payload.textColor}, bg: ${payload.bgColor}`)
    } else if (payload.view === 'menu') {
      handleMenuProfileOK('Saved')
    }
  },
  'command-names-fail': payload => {
    systemMessage('you have no names. try /name <name>')
  },
  'command-names-ok': payload => {
    systemMessage(`names: ${payload.names.join(', ')}`)
  },
  'avatar-upload-fail': payload => {
    if (payload.view === 'command') {
      systemMessage(`invalid image. if you are certain the image you uploaded is valid, please contact lynn`)
    } else if (payload.view === 'menu') {
      handleMenuProfileInfo(`Invalid image`, true)
    }
  },
  'avatar-upload-auth-required': payload => {
    if (payload.view === 'command') {
      systemMessage('only named users can upload an avatar. use /name to name yourself')
    } else if (payload.view === 'menu') {
      handleMenuProfileInfo('Change name before changing avatar', true)
    }
  },
  'avatar-upload-ok': payload => {
    if (payload.view === 'command') {
      systemMessage('avatar updated')
    }
    menuDataElements.avatar.src = `/avatars/${payload.avatar}`
  },
  'command-daily-fail': payload => {
    systemMessage(`next daily in ${formatTimeDelta(payload.time)}`)
  },
  'command-daily-auth-required': payload => {
    systemMessage('only named users can claim daily currency. use /name to name yourself')
  },
  'command-daily-ok': payload => {
    const premiumText = payload.premiumCurrency > 0 ? ` +<b>${payload.premiumCurrency}</b>${premiumCurrencyEmoji}` : ''
    const subText = payload.sub ? ' (sub bonus)' : ''
    systemMessage(`+<b>${payload.currency}</b>${currencyEmoji}${premiumText}${subText} | next daily in ${formatTimeDelta(payload.time)}`)
  },
  'command-stats-auth-required': payload => {
    systemMessage('only named users can view Petal stats. use /name to name yourself')
  },
  'command-stats-ok': payload => {
    switch (payload.statsView) {
      case 'command-bal':
        const currency = payload.stats.currency || 0
        const currencyStr = currency !== 1 ? `${currencyEmoji} ${currencyName}s` : `${currencyEmoji} ${currencyName}`
        const premiumCurrency = payload.stats.premiumCurrency || 0
        const premiumCurrencyStr = premiumCurrency !== 1 ? `${premiumCurrencyEmoji} ${premiumCurrencyName}s` : `${premiumCurrencyEmoji} ${premiumCurrencyName}`
        systemMessage(`<b>${currency}</b>${currencyStr}, <b>${premiumCurrency}</b>${premiumCurrencyStr}`)
        break
    }
    handleStatsData(payload.stats)
    handleKofiData(payload.kofi)
  },
  'command-data-ok': payload => {
    console.log(payload.data)
  },
  'command-addmod-ok': payload => {
    systemMessage(`added <b>${payload.name}</b> as a moderator`)
  }
}

const events = {
  onerror: event => {
    // don't display auto-reconnect errors
    if (reconnectInterval !== -1) return
    console.error(event)
  },
  onclose: event => {
    if (data.autoReconnect) {
      if (reconnectInterval === -1) {
        systemMessage(`connection closed by the server. trying to reconnect...`)
        reconnectInterval = setInterval(() => {
          if (reconnectInterval !== -1) {
            server = connect(data.server)
          }
          
        }, 1000)
      }
    } else {
      systemMessage(`connection closed by the server. use /connect or refresh the page`)
    }
  },
  onopen: event => {
    clearInterval(reconnectInterval)
    reconnectInterval = -1

    if (data.showConnectionEvents) {
      systemMessage('connected')
    }

    setData('server', server.url)

    if (data.name !== undefined && data.token !== undefined) {
      send({
        type: 'auth-token',
        name: data.name,
        token: data.token
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

  if (data.showConnectionEvents) {
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
      if (data.server !== undefined) {
        dest = data.server
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
          name: args,
          view: 'command',
        })
        return 1
      } else {
        payloadHandlers['auth-name-invalid']({view: 'command'})
        return -1
      }
    } else if (data.name !== undefined) {
      if (data.color !== undefined) {
        systemMessage(`your name is <b style="color:${data.color}">${data.name}</b>`)
        return 1
      } else {
        systemMessage(`your name is <b>${data.name}</b>`)
        return 1
      }
    } else {
      systemMessage('you have the default name. use /name <name> to set one')
      return -1
    }
  },
  rename: args => {
    if (data.token !== undefined) {
      if (args && validName(args)) {
        send({
          type: 'command-rename',
          name: args
        })
      } else {
        payloadHandlers['command-rename-invalid']({view: 'command'})
        return -1
      }
    } else {
      payloadHandlers['command-rename-auth-required']({view: 'command'})
      return 1
    }
  },
  kofi: args => {
    if (data.token !== undefined) {
      if (args && validEmail(args)) {
        send({
          type: 'command-kofi',
          kofi: args,
          view: 'command',
        })
        return 1
      } else {
        systemMessage('invalid email address')
        return -1
      }
    } else {
      payloadHandlers['command-kofi-auth-required']({view: 'command'})
      return 1
    }
  },
  password: args => {
    if (data.token !== undefined) {
      passwordMode = true
      entry.focus()
      systemMessage('enter a new password (enter nothing to cancel)')
      return 1
    } else {
      systemMessage('only named users can set a password. use /name to name yourself')
      return 1
    }
  },
  names: args => {
    if (data.token !== undefined) {
      send({
        type: 'command-names',
      })
      return 1
    } else {
      payloadHandlers['command-names-fail']({view: 'command'})
      return 1
    }
  },
  color: args => {
    if (args) {
      if (data.token !== undefined) {
        if (validHexColor(args)) {
          send({
            type: 'command-color',
            color: args
          })
          return 1
        } else {
          payloadHandlers['command-colors-invalid']({view: 'command'})
          return -1
        }
      } else {
        payloadHandlers['command-profile-auth-required']({view: 'command'})
          return 1
      }
    } else if (data.color !== undefined) {
      systemMessage(`your name color is <b style="color: ${data.color};">${data.color}</b>`)
      return 1
    } else {
      systemMessage('you have the default name color. use /color <color> (ex. /color #ffaaaa)')
      return -1
    }
  },
  nameColor: args => {
    commands[color](args)
  },
  textcolor: args => {
    if (args) {
      if (data.token !== undefined) {
        if (validHexColor(args)) {
          send({
            type: 'command-textcolor',
            color: args
          })
          return 1
        } else {
          payloadHandlers['command-colors-invalid']({view: 'command'})
          return -1
        }
      } else {
        payloadHandlers['command-profile-auth-required']({view: 'command'})
        return 1
      }
    } else if (data.textColor !== undefined) {
      systemMessage(`your text color is <b style="color: ${data.textColor};">${data.textColor}</b>`)
      return 1
    } else {
      systemMessage('you have the default text color. use /textcolor <color> (ex. /textcolor #ffaaaa)')
      return -1
    }
  },
  bgcolor: args => {
    if (args) {
      if (data.token !== undefined) {
        if (validHexColor(args)) {
          send({
            type: 'command-bgcolor',
            color: args
          })
          return 1
        } else {
          payloadHandlers['command-colors-invalid']({view: 'command'})
          return -1
        }
      } else {
        payloadHandlers['command-profile-auth-required']({view: 'command'})
        return -1
      }
    } else if (data.bgColor !== undefined) {
      systemMessage(`your background color is <b style="color: ${data.bgColor};">${data.bgColor}</b>`)
      return 1
    } else {
      systemMessage('you have the default background color. use /bgcolor <color> (ex. /bgcolor #ffaaaa)')
      return -1
    }
  },
  colors: args => {
    if (args) {
      const colors = args.split(/\s+/)
      if (colors.length !== 3 || !colors.every(c => validHexColor(c))) {
        payloadHandlers['command-colors-invalid']({view: 'command'})
        return -1
      } else {
        const result = checkColors(...colors)
        if (result.good) {
          send({
            type: 'command-colors',
            nameColor: colors[0],
            textColor: colors[1],
            bgColor: colors[2],
            view: 'command',
          })
        } else {
          payloadHandlers['command-colors-fail']({
            type: 'command-colors-fail',
            reason: result.reason,
            view: 'command',
          })
        }
      }
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
    if (data.lastUserPrivateMessaged === undefined) {
      systemMessage('no previous recipient. example: /w exampleUser23 hi, /c hello again!')
      return -1
    } else if (args && args.length > 0) {
      send({
        type: 'priv-message',
        name: data.lastUserPrivateMessaged,
        body: sanitize(args),
      })
      return 1
    } else {
      systemMessage('missing message. example: /w exampleUser23 hi, /c hello again!')
      return -1
    }
  },
  daily: args => {
    if (data.token !== undefined) {
      send({
        type: 'command-daily',
      })
      return 1
    } else {
      payloadHandlers['command-daily-auth-required']({view: 'command'})
      return 1
    }
  },
  bal: args => {
    if (data.token !== undefined) {
      send({
        type: 'command-stats',
        statsView: 'command-bal',
      })
      return 1
    } else {
      payloadHandlers['command-stats-auth-required']({view: 'command'})
      return 1
    }
  },
  data: args => {
    send({
      type: 'command-data',
      data: args,
    })
    return 1
  },
  addmod: args => {
    send({
      type: 'command-addmod',
      name: args,
    })
    return 1
  },
  title: args => {
    if (data.moderator && args && args.length > 0) {
      send({
        type: 'command-title',
        title: sanitize(args)
      })
      systemMessage('updated stream title')
      return 1
    } else {
      systemMessage(`stream title: ${streamTitleString}`)
      return 1
    }
  },
  logstream: args => {
    if (data.moderator) {
      if (streamTitleString.length > 0) {
        send({
          type: 'command-logstream',
          title: sanitize(streamTitleString)
        })
        systemMessage('sent stream history item')
        return 1
      } else {
        systemMessage('stream title is blank')
        return 1
      }
    }
  },
}

const tryCommand = content => {
  if (content.charAt(0) === '/') {
    const spaceIndex = content.search(' ')
    const cmd = spaceIndex !== -1 ? content.slice(1, spaceIndex) : content.slice(1)
    if (commands.hasOwnProperty(cmd)) {
      return commands[cmd](spaceIndex !== -1 ? content.slice(spaceIndex + 1) : null)
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
      entryPassword = entryPassword.slice(0, -1)
      entry.value = entry.value.slice(0, -1)
    } else if (event.key.length < 2)  {
      entryPassword += event.key
      entry.value = passwordChar.repeat(entryPassword.length)
    } else if (event.key === 'Enter') {
      entry.value = ''
      passwordMode = false
      if (entryPassword === '') return systemMessage('password entry cancelled')
      if (data.token !== undefined) {
        send({
          type: 'command-password',
          password: entryPassword,
          view: payload.view,
        })
      } else {
        send({
          type: 'auth-password',
          name: tempName,
          password: entryPassword,
          view: payload.view,
        })
        tempName = ''
      }
      entryPassword = ''
    }
    event.preventDefault()
    event.stopPropagation()

  } else if (event.key === 'Enter' && !event.shiftKey) {
    // prevent newline character
    event.preventDefault()

    const processedEntry = processText(entry.value)

    if (processedEntry !== '') {
      // send command/message
      const commandResult = tryCommand(processedEntry)

      switch (commandResult) {
        case -1:
          break
        case 0:
          if (processedEntry.length <= maxMessageLength) {
            try {
              send({
                type: 'message',
                body: processedEntry
              })
              entry.value = ''
            } catch (e) {
              console.log(e)
              systemMessage('failed to send message. use /connect to reconnect or refresh the page')
            }
          } else {
            systemMessage(`failed to send message. ${processedEntry.length} characters long, max message length is ${maxMessageLength}`)
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
  } else if (event.key === 'Escape' && !escapeKeyHeld) {
    escapeKeyHeld = true
    toggleMenu()
  } else if (!(menuOpen || escapeKeyHeld || controlKeyHeld)) {
    entry.focus()
    processKeyboardEvent(event)
  } else if (escapeKeyHeld) {
    const tabIndex = Number(event.key)
    if (tabIndex > 0 && tabIndex <= numMenuTabs) {
      toggleMenuTab(menuTabs[tabIndex - 1])
    }
    event.preventDefault()
  }
  if (messageContextMenuOpen) {
    clearMessageContextMenu()
  }
})

body.addEventListener('keyup', event => {
  if (event.key === 'Control') {
    controlKeyHeld = false
  } else if (event.key === 'Escape') {
    escapeKeyHeld = false
  }
})

body.addEventListener('click', event => {
  if (menuOpen && event.target.closest('#menu') === null && document.querySelector('#clr-picker.clr-open') === null) {
    menuOpen = false
    Coloris.close()
    menu.classList.add('hidden')
    resetMenu()
  }
  if (messageContextMenuOpen && event.target.closest('#messageContextMenu') === null) {
    clearMessageContextMenu()
  }
  if (profilePopoverOpen && event.target.closest('#profilePopover') === null) {
    profilePopoverOpen = false
    profilePopoverName.innerText = ''
    profilePopover.classList.add('hidden')
  }
  if (streamInfoMenuOpen && event.target.closest('#streamInfoMenu') === null) {
    streamInfoMenuOpen = false
    streamInfoMenu.classList.add('hidden')
    streamInfo.classList.remove('active')
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
    data: avatarCanvas.toDataURL('image/png'),
    view: menuOpen ? 'menu' : 'command'
  })
})
avatarInput.addEventListener('change', event => {
  avatarImage.src = URL.createObjectURL(avatarInput.files[0])
})

backToLatest.addEventListener('click', event => {
  backToLatest.classList.add('hidden')
  messages.scrollTop = messages.scrollHeight
})

petal.addEventListener('click', event => {
  toggleMenu()
  event.stopPropagation()
  if (messageContextMenuOpen) {
    clearMessageContextMenu()
  }
  if (profilePopoverOpen) {
    profilePopoverOpen = false
    profilePopoverName.innerText = ''
    profilePopover.classList.add('hidden')
  }
  if (streamInfoMenuOpen) {
    streamInfoMenuOpen = false
    streamInfoMenu.classList.add('hidden')
    streamInfo.classList.remove('active')
  }
})

menuTabs.forEach(tab => tab.addEventListener('click', event => toggleMenuTab(tab)))

menuDataElements.name.addEventListener('click', menuNameOnClick)
editNameIcon.addEventListener('click', menuNameOnClick)

const checkMenuName = () => {
  menuDataElements.name.contentEditable = 'false'
  if (menuDataElements.name.innerText === '') {
    menuDataElements.name.innerText = data.name || 'anon'
  }
  return checkProfile()
}

menuDataElements.name.addEventListener('keydown', event => {
  if (event.key === 'Enter') {
    event.preventDefault()
    event.stopPropagation()
    const valid = checkMenuName()
    if (valid) {
      saveProfile.click()
    }
  }
})

menuDataElements.name.addEventListener('focusout', event => {
  checkMenuName()
})

menuDataElements.name.style.color = data.color = rgbToHex(window.getComputedStyle(menuDataElements.name).color)
menuDataElements.message.style.color = data.textColor = rgbToHex(window.getComputedStyle(menuDataElements.message).color)
menuDataElements.background.style.backgroundColor = data.bgColor = rgbToHex(window.getComputedStyle(menuDataElements.background).backgroundColor)
menuDataElements.background.style.fill = data.color
menuDataElements.background.style.stroke = data.color

nameColorButton.addEventListener('click', event => {
  if (lastColorOpen === 'name') return
  if (nameColorButton.classList.contains('active')) {
    nameColorButton.classList.remove('active')
    return
  }
  nameColorButton.classList.add('active')
  colorisConfig.theme = body.clientWidth >= 1200 ? 'pill' : 'polaroid'

  Coloris({...colorisConfig, onChange: color => {
    menuDataElements.name.style.color = color
    menuDataElements.background.style.fill = color
    menuDataElements.background.style.stroke = color
    checkProfile()
  }})
  nameColorInput.click()
})
messageColorButton.addEventListener('click', event => {
  if (lastColorOpen === 'message') return
  if (messageColorButton.classList.contains('active')) {
    messageColorButton.classList.remove('active')
    event.preventDefault()
    return
  }
  messageColorButton.classList.add('active')
  colorisConfig.theme = body.clientWidth >= 1200 ? 'pill' : 'polaroid'

  Coloris({...colorisConfig, onChange: color => {
    menuDataElements.message.style.color = color
    checkProfile()
  }})
  messageColorInput.click()
})
backgroundColorButton.addEventListener('click', event => {
  if (lastColorOpen === 'bg') return
  if (backgroundColorButton.classList.contains('active')) {
    backgroundColorButton.classList.remove('active')
    return
  }
  backgroundColorButton.classList.add('active')
  colorisConfig.theme = body.clientWidth >= 1200 ? 'pill' : 'polaroid'

  Coloris({...colorisConfig, onChange: color => {
    menuDataElements.background.style.backgroundColor = color
    checkProfile()
  }})
  backgroundColorInput.click()
})

let clearLastColorOpenTimeout = -1
const clearLastColorOpen = () => clearLastColorOpenTimeout = setTimeout(() => {lastColorOpen = null}, 100)

nameColorInput.addEventListener('open', () => {
  clearTimeout(clearLastColorOpenTimeout)
  lastColorOpen = 'name'
})
messageColorInput.addEventListener('open', () => {
  clearTimeout(clearLastColorOpenTimeout)
  lastColorOpen = 'message'
})
backgroundColorInput.addEventListener('open', () => {
  clearTimeout(clearLastColorOpenTimeout)
  lastColorOpen = 'bg'
})
nameColorInput.addEventListener('close', clearLastColorOpen)
messageColorInput.addEventListener('close', clearLastColorOpen)
backgroundColorInput.addEventListener('close', clearLastColorOpen)

Coloris(colorisConfig)

saveProfile.addEventListener('click', event => {
  menuDataElements.profileInfo.classList.add('hidden')
  saveProfile.classList.add('hidden')
  resetProfile.classList.add('hidden')

  if (!enterPasswordInput.classList.contains('hidden')) {
    enterPasswordInput.classList.add('hidden')

    send({
      type: 'auth-password',
      name: menuDataElements.name.innerText,
      password: enterPasswordInput.value,
      view: 'menu',
    })

    enterPasswordInput.value = ''
    saveProfile.innerText = 'Save'
    resetProfile.innerText = 'Reset'

  } else if (data.token === undefined) {
    send({
      type: 'auth-name',
      name: menuDataElements.name.innerText,
      view: 'menu',
    })
  } else {
    send({
      type: 'command-profile',
      name: menuDataElements.name.innerText,
      nameColor: rgbToHex(menuDataElements.name.style.color),
      textColor: rgbToHex(menuDataElements.message.style.color),
      bgColor: rgbToHex(menuDataElements.background.style.backgroundColor),
      view: 'menu',
    })
  }
})

resetProfile.addEventListener('click', event => {
  menuDataElements.profileInfo.classList.add('hidden')
  resetProfile.classList.add('hidden')
  saveProfile.classList.add('hidden')
  nameColorButton.classList.remove('active')
  messageColorButton.classList.remove('active')
  backgroundColorButton.classList.remove('active')
  menuDataElements.bioInfo.classList.add('hidden')
  saveBio.classList.add('hidden')

  if (!enterPasswordInput.classList.contains('hidden')) {
    menuDataElements.name.classList.remove('cursor-inherit')
    menuDataElements.name.addEventListener('click', menuNameOnClick)
    editNameIcon.addEventListener('click', menuNameOnClick)
    enterPasswordInput.classList.add('hidden')
    enterPasswordInput.value = ''
    saveProfile.innerText = 'Save'
    resetProfile.innerText = 'Reset'
  }

  menuDataElements.name.innerText = data.name || 'anon'
  menuDataElements.name.style.color = data.color
  menuDataElements.message.style.color = data.textColor
  menuDataElements.background.style.backgroundColor = data.bgColor
  menuDataElements.background.style.fill = data.color
  menuDataElements.background.style.stroke = data.color
  menuDataElements.bio.value = data.bio || ''
})

nameColorInput.addEventListener('close', event => nameColorButton.classList.remove('active'))
messageColorInput.addEventListener('close', event => messageColorButton.classList.remove('active'))
backgroundColorInput.addEventListener('close', event => backgroundColorButton.classList.remove('active'))

menuDataElements.bio.addEventListener('input', event => saveBio.classList.remove('hidden'))

saveBio.addEventListener('click', event => {
  saveBio.classList.add('hidden')
  if (menuDataElements.bio.value.length <= maxBioLength && menuDataElements.bio.value.split(/\r\n|\r|\n/).length<maxBioLines ) {
    send({
      type: 'bio',
      bio: sanitize(menuDataElements.bio.value)
    })
  }else if(menuDataElements.bio.value.length > maxBioLength) {
    menuDataElements.bioInfo.innerText = `Bio cannot be longer than ${maxBioLength} characters`
    menuDataElements.bioInfo.classList.remove('hidden')
  }
   else if(menuDataElements.bio.value.split(/\r\n|\r|\n/).length>maxBioLines){
  
    menuDataElements.bioInfo.innerText= `Bio cannot be longer than ${maxBioLines} lines vertically`
    menuDataElements.bioInfo.classList.remove('hidden')
   
  }
})

let passwordCheckTimeout = null

const passwordOnInput = event => {
  savePassword.classList.add('hidden')
  clearTimeout(passwordCheckTimeout)
  passwordCheckTimeout = setTimeout(() => {
    if (changePasswordInput.value === '' || confirmPasswordInput.value === '') {
      menuDataElements.passwordInfo.classList.add('hidden')
    } else if (changePasswordInput.value !== confirmPasswordInput.value) {
      menuDataElements.passwordInfo.classList.remove('good')
      menuDataElements.passwordInfo.innerText = 'Does not match'
      menuDataElements.passwordInfo.classList.remove('hidden')
    } else {
      menuPassword = changePasswordInput.value
      menuDataElements.passwordInfo.classList.add('hidden')
      savePassword.classList.remove('hidden')
    }
  }, 100)
}

changePasswordInput.addEventListener('input', passwordOnInput)
confirmPasswordInput.addEventListener('input', passwordOnInput)

savePassword.addEventListener('click', event => {
  savePassword.classList.add('hidden')
  if (menuPassword !== '') {
    send({
      type: 'command-password',
      password: menuPassword,
      view: 'menu',
    })

    // the following 3 lines should execute immediately for security reasons
    menuPassword = ''
    changePasswordInput.value = ''
    confirmPasswordInput.value = ''
    // end security lines
  }
})

let kofiCheckTimeout = null

kofiInput.addEventListener('input', event => {
  saveKofi.classList.add('hidden')
  clearTimeout(kofiCheckTimeout)
  kofiCheckTimeout = setTimeout(() => {
    if (kofiInput.value === '') {
      menuDataElements.kofiInfo.classList.add('hidden')
    } else if (validEmail(kofiInput.value)) {
      menuKofi = kofiInput.value
      menuDataElements.kofiInfo.classList.add('hidden')
      saveKofi.classList.remove('hidden')
    } else {
      menuDataElements.kofiInfo.classList.remove('good')
      menuDataElements.kofiInfo.innerText = 'Invalid email'
      menuDataElements.kofiInfo.classList.remove('hidden')
    }
  }, 100)
})

saveKofi.addEventListener('click', event => {
  saveKofi.classList.add('hidden')
  if (menuKofi !== '') {
    send({
      type: 'command-kofi',
      kofi: menuKofi,
      view: 'menu',
    })

    // the following 2 lines should execute immediately for security reasons
    menuKofi = ''
    kofiInput.value = ''
    // end security lines
  }
})

showConnectionEvents.checked = data.showConnectionEvents
showConnectionEvents.addEventListener('change', event => {
  setData('showConnectionEvents', showConnectionEvents.checked)
})

autoReconnect.checked = data.autoReconnect
autoReconnect.addEventListener('change', event => {
  setData('autoReconnect', autoReconnect.checked)
})

messageScrollThreshold.value = data.messageScrollThreshold
menuDataElements.messageScrollThreshold.innerText = `${messageScrollThreshold.value}px`

messageScrollThreshold.addEventListener('input', event => {
  setData('messageScrollThreshold', Number(messageScrollThreshold.value))
  menuDataElements.messageScrollThreshold.innerText = `${messageScrollThreshold.value}px`
})

let updateScrollPositionTimeout = null

messages.addEventListener('scroll', event => {
  clearTimeout(updateScrollPositionTimeout)
  updateScrollPositionTimeout = setTimeout(() => {
    if (messages.clientHeight + messages.scrollTop + data.messageScrollThreshold < messages.scrollHeight) {
      backToLatest.classList.remove('hidden')
    } else {
      backToLatest.classList.add('hidden')
    }
  }, 100)
})

messages.addEventListener('click', event => {
  const profileTrigger = event.target.closest('.msg-group .avatar, .msg-group .author')
  if (profileTrigger !== null) {
    const profileMessage = profileTrigger.closest('.msg-group').querySelector('.msg')
    if (
      profileMessage !== null &&
      profileTrigger.closest('.msg-group').querySelector('.author').innerText !== profilePopoverName.innerText &&
      profileMessage.id !== ''
    ) {
      send({
        type: 'profile-from-message',
        id: profileMessage.id.replace('msg-', '')
      })

      profilePopover.style.left = event.clientX + 10 + 'px'
      profilePopover.style.top = event.clientY + 'px'
    } else {
      profilePopoverOpen = false
      profilePopoverName.innerText = ''
      profilePopover.classList.add('hidden')
    }
  }
})

messages.addEventListener('contextmenu', event => {
  if (data.moderator) {
    const message = event.target.closest('.msg-group .msg')
    if (message !== null) {
      messageContextMenuOpen = true
      messageContextMenu.dataset.id = message.id.replace('msg-', '')
      messageContextMenu.style.left = event.clientX + 10 + 'px'
      messageContextMenu.style.top = event.clientY + 'px'
      messageContextMenu.classList.remove('hidden')
      event.preventDefault()
    }
  }
})

messageContextMenu.addEventListener('click', event => {
  if (messageContextMenuOpen) {
    messageContextMenuOpen = false
    messageContextMenu.classList.add('hidden')

    if (messageContextMenu.dataset.id !== '') {
      send({
        type: 'command-delete-message',
        id: messageContextMenu.dataset.id
      })
      messageContextMenu.dataset.id = ''
    }
    messageContextMenu.style.left = ''
    messageContextMenu.style.top = ''
  }
})

window.addEventListener('resize', event => {
  const scrolled = tryScrollFrom(messages.scrollHeight)
  if (scrolled) {
    backToLatest.classList.add('hidden')
  } else {
    backToLatest.classList.remove('hidden')
  }
})

/* auto-connect */

if (data.server !== undefined) {
  server = connect(data.server)
}

/* From https://github.com/bluenviron/mediamtx/blob/main/internal/servers/webrtc/read_index.html */
/* MediaMTX is MIT-licensed */

if (streamPage) {
  const streamHistoryInterval = setInterval(() => {
    const time = Date.now()
    let html = ''
    for (const stream of streamHistoryArray) {
      const streamTime = new Date(stream.time)
      html += `<li><a href="${stream.vod}">${stream.title}</a><span>~${formatTimeDelta(time - stream.time).split(' ')[0]} ago @ ${streamTime.getHours() % 12}:${streamTime.getMinutes()} ${streamTime.getHours() / 12 < 1 ? 'AM' : 'PM'}</span></li>`
    }
    menuDataElements.streamHistory.innerHTML = html
  }, 1000)

  streamInfo.addEventListener('click', event => {
    if (!streamInfoMenuOpen) {
      event.stopPropagation()
      streamInfoMenuOpen = true
      streamInfo.classList.add('active')
      streamInfoMenu.classList.remove('hidden')
    }
  })

  const initialRetryDelay = 2000
  const retryDelayScalar = 1.5
  let retryDelay = initialRetryDelay

  let pc = null
  let offlineSince = null
  let restartTimeout = null
  let sessionUrl = ''
  let offerData = ''
  let queuedCandidates = []

  // const showStreamInfo = str => {
  //   streamInfo.innerText = str
  //   streamInfo.style = 'display: block;'
  // }

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
      // showStreamInfo(`lynnya is offline (${formatTimeDelta(Date.now() - offlineSince)})`)

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
          // showStreamInfo('stream not found')
        default:
          // showStreamInfo(`bad status code ${res.status}`)
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
    streamInfo.style = ''
    stream.srcObject = evt.streams[0]
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

  loadStream()
}

})