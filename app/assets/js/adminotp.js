(() => {
const ADMIN_OTP_VERIFY_URL = 'http://127.0.0.1:8787/otp/verify'
const ADMIN_OTP_REQUEST_URL = 'http://127.0.0.1:8787/otp/request'
const ADMIN_TRIGGER_PSEUDOS = new Set(['kylanmc0001', 'matteo'])

const loginUsername = document.getElementById('loginUsername')
const loginButton = document.getElementById('loginButton')
const adminOtpPanel = document.getElementById('adminOtpPanel')
const adminOtpInput = document.getElementById('adminOtpInput')
const adminOtpVerify = document.getElementById('adminOtpVerify')
const adminOtpStatus = document.getElementById('adminOtpStatus')
let activeTriggerPseudo = null

function setAdminOtpStatus(message, success = false) {
    adminOtpStatus.textContent = message
    adminOtpStatus.style.color = success ? '#72d572' : '#ff8d83'
}

function isAdminTriggerPseudo(value) {
    return ADMIN_TRIGGER_PSEUDOS.has(value.trim().toLowerCase())
}

async function requestAdminOtp(pseudo) {
    setAdminOtpStatus('Envoi du code en message privé Discord...', true)
    try {
        const response = await fetch(ADMIN_OTP_REQUEST_URL, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ pseudo })
        })
        const result = await response.json()
        if(response.status === 429) {
            throw new Error(`Attends ${result.retryAfterSeconds} s avant une nouvelle demande.`)
        }
        if(!response.ok) throw new Error('Envoi impossible. Vérifie que le bot Discord est lancé et que les messages privés sont autorisés.')
        setAdminOtpStatus('Code envoyé en message privé Discord. Il expire dans 5 minutes.', true)
    } catch(error) {
        setAdminOtpStatus(error.message || 'Impossible de contacter le bot Discord.')
    }
}

window.isAdminTriggerPseudo = isAdminTriggerPseudo

function updateAdminOtpVisibility() {
    const adminPseudo = isAdminTriggerPseudo(loginUsername.value)
    adminOtpPanel.hidden = !adminPseudo
    loginButton.hidden = adminPseudo
    if(adminPseudo) {
        const normalizedPseudo = loginUsername.value.trim().toLowerCase()
        adminOtpInput.focus()
        if(activeTriggerPseudo !== normalizedPseudo) {
            activeTriggerPseudo = normalizedPseudo
            requestAdminOtp(normalizedPseudo)
        }
    } else {
        activeTriggerPseudo = null
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
        if(response.status === 401 && result.error === 'invalid_or_expired_code') {
            setAdminOtpStatus('Code OTP invalide ou expiré. Vérifie les 6 chiffres du dernier DM reçu.')
            adminOtpInput.select()
            return
        }
        if(response.status === 403) {
            setAdminOtpStatus('Ce pseudo n’est pas autorisé pour l’accès admin.')
            return
        }
        if(!response.ok) {
            setAdminOtpStatus('Le service OTP a refusé la vérification. Relance le bot puis demande un nouveau code.')
            return
        }
        if(result.role !== 'admin') {
            setAdminOtpStatus('Réponse invalide du service OTP. Relance le bot et redemande un code.')
            return
        }

        const authAccount = await AuthManager.addMojangAccount(pseudo, '')
        updateSelectedAccount(authAccount)
        adminOtpInput.value = ''
        setAdminOtpStatus('Accès administrateur activé.', true)
        setTimeout(() => {
            switchView(getCurrentView(), VIEWS.landing)
        }, 500)
    } catch {
        setAdminOtpStatus('Service OTP inaccessible. Vérifie que le bot est lancé, puis redemande un code.')
    } finally {
        adminOtpVerify.disabled = false
    }
})

adminOtpInput.addEventListener('keydown', event => {
    if(event.key === 'Enter') {
        event.preventDefault()
        adminOtpVerify.click()
    }
})
})()