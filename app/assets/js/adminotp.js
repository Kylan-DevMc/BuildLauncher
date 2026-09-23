const ADMIN_OTP_VERIFY_URL = 'http://127.0.0.1:8787/otp/verify'
const ADMIN_TRIGGER_PSEUDOS = new Set(['kylanmc0001', 'matteo'])

const loginUsername = document.getElementById('loginUsername')
const loginButton = document.getElementById('loginButton')
const adminOtpPanel = document.getElementById('adminOtpPanel')
const adminOtpInput = document.getElementById('adminOtpInput')
const adminOtpVerify = document.getElementById('adminOtpVerify')
const adminOtpStatus = document.getElementById('adminOtpStatus')

function setAdminOtpStatus(message, success = false) {
    adminOtpStatus.textContent = message
    adminOtpStatus.style.color = success ? '#72d572' : '#ff8d83'
}

function isAdminTriggerPseudo(value) {
    return ADMIN_TRIGGER_PSEUDOS.has(value.trim().toLowerCase())
}

window.isAdminTriggerPseudo = isAdminTriggerPseudo

function updateAdminOtpVisibility() {
    const adminPseudo = isAdminTriggerPseudo(loginUsername.value)
    adminOtpPanel.hidden = !adminPseudo
    loginButton.hidden = adminPseudo
    if(adminPseudo) {
        adminOtpInput.focus()
    } else {
        adminOtpInput.value = ''
        adminOtpStatus.textContent = ''
        window.adminSession = null
    }
}

loginUsername.addEventListener('input', updateAdminOtpVisibility)
window.addEventListener('adminOtpRequired', updateAdminOtpVisibility)
updateAdminOtpVisibility()

adminOtpVerify.addEventListener('click', async () => {
    const code = adminOtpInput.value.trim()
    const pseudo = loginUsername.value.trim()
    if(!isAdminTriggerPseudo(pseudo)) return
    if(!/^\d{6}$/.test(code)) {
        setAdminOtpStatus('Le code doit contenir 6 chiffres.')
        return
    }

    adminOtpVerify.disabled = true
    setAdminOtpStatus('Vérification en cours...', true)

    try {
        const response = await fetch(ADMIN_OTP_VERIFY_URL, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ code, pseudo })
        })
        const result = await response.json()
        if(!response.ok || result.role !== 'admin') throw new Error('invalid')

        window.adminSession = { role: 'admin', verifiedAt: Date.now() }
        adminOtpInput.value = ''
        setAdminOtpStatus('Accès administrateur activé.', true)
    } catch {
        setAdminOtpStatus('Code invalide, expiré ou serveur inaccessible.')
    } finally {
        adminOtpVerify.disabled = false
    }
})