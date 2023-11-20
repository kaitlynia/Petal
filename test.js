document.addEventListener('DOMContentLoaded', () => {
  const upload = document.createElement('canvas')
  upload.width = 256
  upload.height = 256
  const context = upload.getContext('2d')
  const picker = document.querySelector('#avatar')
  const pickerImg = new Image()
  pickerImg.onload = () => {
    context.drawImage(pickerImg, 0, 0, upload.width, upload.height)
    console.log(upload.toDataURL('image/png'))
  }

  picker.addEventListener('change', ev => {
    pickerImg.src = URL.createObjectURL(picker.files[0])
  })

  const isColor = s => {
    const style = new Option().style
    style.color = s
    return !['unset', 'initial', 'inherit', ''].includes(style.color)
  }
  const text = document.querySelector('#color')
  const result = document.querySelector('#validColor')
  text.addEventListener('keyup', ev => {
    result.innerHTML = isColor(ev.target.value)
  })
})