/* global document, window */
(() => {
    const loginPanel = document.getElementById('loginPanel')
    const adminPanel = document.getElementById('adminPanel')
    const status = document.getElementById('status')
    const adminStatus = document.getElementById('adminStatus')
    let sessionToken = null
    let articles = []
    let mods = []

    function setStatus(element, message, error = false) {
        element.textContent = message
        element.style.color = error ? '#ff8d83' : '#a9d647'
    }

    async function requestJson(path, options = {}) {
        const headers = { 'content-type': 'application/json', ...options.headers }
        if(sessionToken) headers.authorization = `Bearer ${sessionToken}`
        const response = await fetch(path, { ...options, headers })
        let body
        try {
            body = await response.json()
        } catch {
            throw new Error('Réponse invalide du serveur.')
        }
        if(!response.ok) throw new Error(body.error || `Erreur HTTP ${response.status}`)
        return body
    }

    function makeListItem(title, id, type) {
        const li = document.createElement('li')
        li.className = 'item'
        const label = document.createElement('span')
        label.className = 'item-title'
        label.textContent = title
        const controls = document.createElement('span')
        controls.className = 'item-actions'
        const edit = document.createElement('button')
        edit.type = 'button'
        edit.className = 'secondary'
        edit.textContent = 'Modifier'
        edit.addEventListener('click', () => editItem(type, id))
        const remove = document.createElement('button')
        remove.type = 'button'
        remove.className = 'secondary'
        remove.textContent = 'Supprimer'
        remove.addEventListener('click', () => deleteItem(type, id))
        controls.append(edit, remove)
        li.append(label, controls)
        return li
    }

    function render() {
        const articlesList = document.getElementById('articlesList')
        const modsList = document.getElementById('modsList')
        articlesList.replaceChildren(...articles.map(item =>
            makeListItem(`${item.title} — ${item.author}`, item.id, 'articles')
        ))
        modsList.replaceChildren(...mods.map(item =>
            makeListItem(`${item.name}${item.version ? ` (${item.version})` : ''} — ${item.serverIds.join(', ')}`, item.id, 'mods')
        ))
    }

    async function loadContent() {
        const content = await requestJson('/content')
        articles = content.articles
        mods = content.mods
        render()
    }

    function editItem(type, id) {
        if(type === 'articles') {
            const item = articles.find(value => value.id === id)
            if(!item) return
            document.getElementById('articleId').value = item.id
            document.getElementById('articleTitle').value = item.title
            document.getElementById('articleAuthor').value = item.author
            document.getElementById('articleLink').value = item.link
            document.getElementById('articleContent').value = item.content
            document.getElementById('cancelArticleEdit').hidden = false
            document.getElementById('articleTitle').focus()
        } else {
            const item = mods.find(value => value.id === id)
            if(!item) return
            document.getElementById('modId').value = item.id
            document.getElementById('modName').value = item.name
            document.getElementById('modVersion').value = item.version
            document.getElementById('modWorlds').value = item.serverIds.join(', ')
            document.getElementById('modUrl').value = item.downloadUrl
            document.getElementById('modSha512').value = item.sha512
            document.getElementById('cancelModEdit').hidden = false
            document.getElementById('modName').focus()
        }
    }

    async function deleteItem(collection, id) {
        if(!window.confirm('Supprimer cet élément ?')) return
        try {
            const result = await requestJson('/admin/content', {
                method: 'POST',
                body: JSON.stringify({ collection, action: 'delete', item: { id } })
            })
            if(collection === 'articles') articles = result.items
            else mods = result.items
            render()
            setStatus(adminStatus, 'Élément supprimé.')
        } catch(error) {
            setStatus(adminStatus, error.message, true)
        }
    }

    document.getElementById('requestOtp').addEventListener('click', async () => {
        const pseudo = document.getElementById('pseudo').value.trim()
        try {
            await requestJson('/otp/request', { method: 'POST', body: JSON.stringify({ pseudo }) })
            setStatus(status, 'Code envoyé par message privé Discord. Il expire dans 5 minutes.')
        } catch(error) {
            setStatus(status, error.message, true)
        }
    })

    document.getElementById('verifyOtp').addEventListener('click', async () => {
        const pseudo = document.getElementById('pseudo').value.trim()
        const code = document.getElementById('otpCode').value.trim()
        try {
            const result = await requestJson('/otp/verify', {
                method: 'POST',
                body: JSON.stringify({ pseudo, code })
            })
            if(result.role !== 'admin' || !result.sessionToken) throw new Error('Session admin invalide.')
            sessionToken = result.sessionToken
            loginPanel.hidden = true
            adminPanel.hidden = false
            await loadContent()
            setStatus(adminStatus, 'Session administrateur ouverte.')
        } catch(error) {
            setStatus(adminPanel.hidden ? status : adminStatus, error.message, true)
        }
    })

    document.getElementById('logout').addEventListener('click', () => {
        sessionToken = null
        loginPanel.hidden = false
        adminPanel.hidden = true
        document.getElementById('otpCode').value = ''
    })

    document.getElementById('articleForm').addEventListener('submit', async event => {
        event.preventDefault()
        const item = {
            id: document.getElementById('articleId').value || undefined,
            title: document.getElementById('articleTitle').value,
            author: document.getElementById('articleAuthor').value,
            link: document.getElementById('articleLink').value,
            content: document.getElementById('articleContent').value
        }
        await saveItem('articles', item, event.currentTarget)
    })

    document.getElementById('modForm').addEventListener('submit', async event => {
        event.preventDefault()
        const serverIds = document.getElementById('modWorlds').value
            .split(',')
            .map(value => value.trim())
            .filter(Boolean)
        const item = {
            id: document.getElementById('modId').value || undefined,
            name: document.getElementById('modName').value,
            version: document.getElementById('modVersion').value,
            serverIds,
            downloadUrl: document.getElementById('modUrl').value,
            sha512: document.getElementById('modSha512').value
        }
        await saveItem('mods', item, event.currentTarget)
    })

    async function saveItem(collection, item, form) {
        try {
            const result = await requestJson('/admin/content', {
                method: 'POST',
                body: JSON.stringify({ collection, action: 'save', item })
            })
            if(collection === 'articles') articles = result.items
            else mods = result.items
            form.reset()
            document.getElementById(collection === 'articles' ? 'articleId' : 'modId').value = ''
            document.getElementById(collection === 'articles' ? 'cancelArticleEdit' : 'cancelModEdit').hidden = true
            if(collection === 'mods') document.getElementById('modWorlds').value = '*'
            render()
            setStatus(adminStatus, 'Modifications enregistrées.')
        } catch(error) {
            setStatus(adminStatus, error.message, true)
        }
    }

    document.getElementById('cancelArticleEdit').addEventListener('click', () => {
        document.getElementById('articleForm').reset()
        document.getElementById('articleId').value = ''
        document.getElementById('cancelArticleEdit').hidden = true
    })
    document.getElementById('cancelModEdit').addEventListener('click', () => {
        document.getElementById('modForm').reset()
        document.getElementById('modId').value = ''
        document.getElementById('modWorlds').value = '*'
        document.getElementById('cancelModEdit').hidden = true
    })
})()
