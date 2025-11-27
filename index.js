/**
 * I Am Safe - Multilingual Emergency Status Board (Mobile Optimized)
 * Cloudflare Worker + D1
 */

// --- 1. Configuration ---
const DEFAULT_LANG = 'cht'; // Set default language to Traditional Chinese
const PAGE_SIZE = 20;       // Records per page
const ADMIN_TOKEN_SECRET_NAME = 'ADMIN_TOKEN'; // The name of the Worker Secret
const EVENT = '大埔宏福苑五級火';

// --- 2. Localization Dictionary ---
const TRANSLATIONS = {
  cht: {
    title: "平安通報程式",
	event: EVENT,
    subtitle: "緊急狀態佈告欄",
    update_header: "更新您的狀態",
    lbl_name: "全名",
    ph_name: "例：陳大文",
    lbl_id: "身份證號碼",
    hint_id: "(可用於搜尋，但不對外公開)",
    ph_id: "例：員工編號或身份證號碼",
    lbl_loc: "目前位置",
    ph_loc: "例：避難所#3, 灣仔", // Updated for Hong Kong context
    lbl_status: "狀態",
    opt_safe: "我平安無事",
    opt_help: "我需要幫助",
    opt_other: "其他 / 正在移動",
    lbl_msg: "訊息 (選填)",
    ph_msg: "我有水和食物。請聯繫...",
    btn_submit: "發佈更新",
    search_ph: "按姓名、ID、位置搜尋...",
    btn_search: "搜尋",
    empty_state: "找不到任何更新。",
    meta_loc: "位置",
    meta_time: "時間",
    err_db: "資料庫暫時無法使用。",
    err_req: "姓名和狀態是必需的。",
    err_save: "儲存狀態時出錯",
    prev_page: "上一頁", 
    next_page: "下一頁", 
    btn_delete: "刪除", // New localization string
    err_auth: "身份驗證失敗或權限不足。", // New localization string
    confirm_delete: "確定要刪除此記錄嗎？", // New localization string
    err_id: "無法刪除：缺少記錄 ID。", // New localization string
    lang_switch: {
      // No other languages to switch to, keeping this structure empty
    }
  }
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const params = url.searchParams;

    // 1. Determine Language
    let lang = params.get('lang');
    if (!TRANSLATIONS[lang]) {
      lang = DEFAULT_LANG;
    }
    const t = TRANSLATIONS[lang];

    // 2. Admin Check
    const adminToken = params.get('admin') || '';
    // Note: isAdmin is only used for UI rendering, not for POST security
    const isAdmin = adminToken && env[ADMIN_TOKEN_SECRET_NAME] === adminToken; 

    // 3. Handle POST
    if (request.method === 'POST') {
      if (url.pathname === '/update') {
        return handlePost(request, env, lang);
      }
      if (url.pathname === '/delete') {
        // Handle delete request, needs admin validation
        // Pass the entire env object to access the secret directly in handleDelete
        return handleDelete(request, env, t); 
      }
    }

    // 4. Handle GET
    return handleGet(request, env, url, lang, isAdmin, adminToken);
  }
};

async function handleGet(request, env, url, lang, isAdmin, adminToken) {
  const searchQuery = url.searchParams.get('q') || '';
  const page = parseInt(url.searchParams.get('p') || '1');
  const offset = (page - 1) * PAGE_SIZE;
  
  const t = TRANSLATIONS[lang];
  let results = [];
  let error = null;
  let hasNext = false;

  try {
    const limit = PAGE_SIZE + 1;
    
    // NOTE: 'id' is now selected, required for admin deletion functionality
    const baseQuery = `SELECT id, name, location, status, message, created_at 
                       FROM safety_checks 
                       ORDER BY created_at DESC LIMIT ${limit} OFFSET ?`;
    
    if (searchQuery) {
      // Search query uses LIMIT and OFFSET
      results = await env.DB.prepare(
        `SELECT id, name, location, status, message, created_at 
         FROM safety_checks 
         WHERE name LIKE ? 
            OR location LIKE ? 
            OR status LIKE ?
            OR id_number LIKE ?
         ORDER BY created_at DESC LIMIT ${limit} OFFSET ?`
      )
      .bind(`%${searchQuery}%`, `%${searchQuery}%`, `%${searchQuery}%`, `%${searchQuery}%`, offset)
      .all();
    } else {
      // Default view uses LIMIT and OFFSET
      results = await env.DB.prepare(baseQuery).bind(offset).all();
    }
  } catch (e) {
    error = t.err_db;
    console.error(e);
  }

  const fetchedPosts = results.results || [];
  
  hasNext = fetchedPosts.length > PAGE_SIZE;
  const postsToDisplay = fetchedPosts.slice(0, PAGE_SIZE);

  const html = renderHTML(postsToDisplay, searchQuery, error, lang, page, hasNext, isAdmin, adminToken);
  
  // Respond with gzip encoding header (Cloudflare handles the actual compression)
  return new Response(html, {
    headers: { 
      'Content-Encoding': 'gzip',
      'Content-Type': 'text/html;charset=UTF-8' 
    }
  });
}

async function handlePost(request, env, currentLang) {
  const t = TRANSLATIONS[currentLang];
  try {
    const formData = await request.formData();
    const name = formData.get('name');
    const idNumber = formData.get('id_number');
    const location = formData.get('location');
    const status = formData.get('status');
    const message = formData.get('message');
    const formLang = formData.get('form_lang') || currentLang; 
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';

    if (!name || !status) {
      return new Response(t.err_req, { status: 400 });
    }

    await env.DB.prepare(
      `INSERT INTO safety_checks (name, id_number, location, status, message, ip_address) 
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(name, idNumber, location, status, message, ip)
    .run();

    return new Response(null, {
      status: 302,
      headers: { 'Location': `/?lang=${formLang}` }
    });
  } catch (e) {
    return new Response(`${t.err_save}: ${e.message}`, { status: 500 });
  }
}

async function handleDelete(request, env, t) {
    try {
        const formData = await request.formData();
        const recordId = formData.get('id');
        const submittedToken = formData.get('admin_token');
        const expectedToken = env[ADMIN_TOKEN_SECRET_NAME];

        // 1. Validate Admin Token
        if (!submittedToken || submittedToken !== expectedToken) {
            console.error(`AUTH FAIL: Received token ${submittedToken ? 'provided' : 'missing'}, expected token ${expectedToken ? 'set' : 'MISSING'}.`);
            return new Response(t.err_auth, { status: 403 });
        }
        
        // 2. Validate Record ID
        if (!recordId) {
            console.error("DELETE FAIL: Missing record ID in form data.");
            return new Response(t.err_id, { status: 400 });
        }
        
        console.log(`Attempting to delete record ID: ${recordId}`);

        // 3. Execute Delete Query
        const deleteResult = await env.DB.prepare(
            `DELETE FROM safety_checks WHERE id = ?`
        )
        // Ensure ID is passed as an integer for strict matching, though D1 is usually lenient
        .bind(parseInt(recordId)) 
        .run();
        
        console.log("Delete query executed. Changes:", deleteResult.changes);

        // 4. Redirect back to the main page (and maintain admin status)
        return new Response(null, {
            status: 302,
            headers: { 'Location': `/?admin=${submittedToken}` }
        });

    } catch (e) {
        console.error("Critical Delete Error:", e.message);
        return new Response(`Error deleting record: ${e.message}`, { status: 500 });
    }
}

/**
 * Helper to render the pagination link HTML.
 */
function renderLink(page, search, lang, text, disabled, adminToken) {
  const qParam = search ? '&q=' + encodeURIComponent(search) : '';
  const adminParam = adminToken ? '&admin=' + encodeURIComponent(adminToken) : '';
  const disabledClass = disabled ? 'disabled' : '';
  return `<a href="/?p=${page}&lang=${lang}${qParam}${adminParam}" class="pagination-btn ${disabledClass}">${text}</a>`;
}

function renderHTML(posts, search, error, lang, page, hasNext, isAdmin, adminToken) {
  const t = TRANSLATIONS[lang];
  const currentPage = page || 1;
  const isPrev = currentPage > 1;
  
  // Determine pagination links (now includes adminToken)
  const prevLink = renderLink(currentPage - 1, search, lang, t.prev_page, !isPrev, adminToken);
  const nextLink = renderLink(currentPage + 1, search, lang, t.next_page, !hasNext, adminToken);

  // Helper to map English status keys to localized text
  const getLocalizedStatus = (statusKey, translations) => {
      switch (statusKey) {
          case 'Safe': return translations.opt_safe;
          case 'Help': return translations.opt_help;
          case 'Other': return translations.opt_other;
          default: return translations.opt_other;
      }
  };

  // Options to ensure the time is displayed in the client's local timezone
  const timeFormatOptions = { 
      year: 'numeric', 
      month: 'numeric', 
      day: 'numeric', 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit', 
      timeZoneName: 'short'
  };


  return `
<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${t.title} • ${t.event}</title>
  <style>
    :root{--bg:#f4f4f5;--card:#fff;--text:#18181b;--primary:#2563eb;--safe:#16a34a;--danger:#dc2626;--border:#e4e4e7;}
    body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;background:var(--bg);color:var(--text);margin:0;padding:4vw;line-height:1.5;}
    .container{max-width:600px;margin:0 auto;position:relative;padding-top:20px;}
    .lang-switch{display:none;}

    h1{margin-bottom:0.3rem;font-size:1.4rem;margin-top:0;}
    .subtitle{color:#52525b;margin-bottom:1.2rem;font-size:0.85rem;}
    
    .card{background:var(--card);padding:1.2rem;border-radius:8px;border:1px solid var(--border);margin-bottom:1.5rem;}
    label{display:block;font-weight:600;margin-bottom:0.3rem;font-size:0.9rem;}
    .label-hint{font-weight:400;color:#71717a;font-size:0.75rem;}
    
    input,select,textarea{
      width:100%;box-sizing:border-box;padding:10px;margin-bottom:0.8rem; 
      border:1px solid var(--border);border-radius:4px;font-size:16px;
    }
    button{
      background:var(--primary);color:white;border:none;padding:12px 20px; 
      border-radius:4px;cursor:pointer;font-size:1rem;width:100%;font-weight:bold;
    }
    button:hover{opacity:0.9;}

    .search-form{display:flex;gap:10px;}
    .search-form input{flex-grow:1;margin-bottom:0;}
    .search-form button{width:auto;flex-shrink:0;}

    .results{border:1px solid var(--border); border-radius:8px;}
    .result-item{background:var(--card);padding:1rem;border-bottom:1px solid var(--border);}
    .result-item:first-child{border-top-left-radius:8px;border-top-right-radius:8px; border-bottom: none;} /* Fix for top corners */
    .result-item:last-child{border-bottom-left-radius:8px;border-bottom-right-radius:8px;border-bottom:none;}
    
    .status-badge{display:inline-block;padding:2px 8px;border-radius:12px;font-size:0.75rem;font-weight:bold;color:white;}
    .status-Safe{background-color:var(--safe);}
    .status-Help{background-color:var(--danger);}
    .status-Other{background-color:#71717a;}
    
    .meta{font-size:0.75rem;color:#71717a;margin-top:0.5rem;}
    .empty{text-align:center;color:#71717a;padding:1.5rem;}
    .error{background:#fee2e2;color:#991b1b;padding:1rem;border-radius:4px;margin-bottom:1rem;}
    
    /* Pagination Styles */
    .pagination{display:flex;justify-content:space-between;align-items:center;padding:1rem 0;font-size:0.9rem;}
    .pagination-btn{
      text-decoration:none;font-weight:bold;color:var(--primary);padding:8px 12px;
      border:1px solid var(--primary);border-radius:4px;display:inline-block;
      min-width: 80px; text-align: center;
    }
    .pagination-btn:hover:not(.disabled){background:var(--primary);color:var(--card);}
    .pagination-btn.disabled{color:#a1a1aa;border-color:#e4e4e7;cursor:default;opacity:0.6;}
    .page-number{color:#71717a;}
    
    /* Admin Delete Button */
    .result-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.5rem; }
    .delete-btn {
        background: var(--danger);
        color: white;
        border: none;
        padding: 4px 8px;
        margin-left: 10px;
        border-radius: 4px;
        font-size: 0.75rem;
        cursor: pointer;
        line-height: 1;
        width: auto;
        font-weight: normal;
        flex-shrink: 0; /* Prevent it from shrinking */
    }
    .delete-btn:hover { background: #b91c1c; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>${t.title}</h1>
      <p class="subtitle">${t.subtitle} • ${t.event}</p>
    </header>

    ${error ? `<div class="error">${error}</div>` : ''}

    <!-- Post Status Form -->
    <div class="card">
      <h2 style="margin-top:0">${t.update_header}</h2>
      <form action="/update" method="POST">
        <input type="hidden" name="form_lang" value="${lang}">
        
        <label>${t.lbl_name}</label>
        <input type="text" name="name" required placeholder="${t.ph_name}">

        <label>${t.lbl_id} <span class="label-hint">${t.hint_id}</span></label>
        <input type="text" name="id_number" placeholder="${t.ph_id}">
        
        <label>${t.lbl_loc}</label>
        <input type="text" name="location" required placeholder="${t.ph_loc}">
        
        <label>${t.lbl_status}</label>
        <select name="status">
          <option value="Safe">${t.opt_safe}</option>
          <option value="Help">${t.opt_help}</option>
          <option value="Other">${t.opt_other}</option>
        </select>
        
        <label>${t.lbl_msg}</label>
        <textarea name="message" rows="3" placeholder="${t.ph_msg}"></textarea>
        
        <button type="submit">${t.btn_submit}</button>
      </form>
    </div>

    <!-- Search Section -->
    <div style="margin-bottom: 1.5rem;">
      <form action="/" method="GET" class="search-form">
        <input type="hidden" name="lang" value="${lang}">
        <input type="hidden" name="admin" value="${adminToken}">
        <input type="text" name="q" value="${search}" placeholder="${t.search_ph}">
        <button type="submit">${t.btn_search}</button>
      </form>
    </div>

    <!-- Results List -->
    <div class="results">
      ${posts.length === 0 ? `<div class="empty">${t.empty_state}</div>` : ''}
      ${posts.map(post => `
        <div class="result-item">
          <div class="result-header">
            <div style="display:flex; align-items: center; max-width: 80%;">
                <strong style="font-size:1.0rem; word-break: break-word;">${escapeHtml(post.name)}</strong>
            </div>
            <div style="display:flex; align-items: center;">
                <span class="status-badge status-${post.status || 'Other'}">
                   ${getLocalizedStatus(post.status, t)}
                </span>
                ${isAdmin ? `
                    <form action="/delete" method="POST" onsubmit="return confirm('${t.confirm_delete}');" style="display:inline;">
                      <input type="hidden" name="id" value="${post.id}">
                      <input type="hidden" name="admin_token" value="${adminToken}">
                      <button type="submit" class="delete-btn" title="${t.btn_delete}">X</button>
                    </form>
                ` : ''}
            </div>
          </div>
          <div style="margin-bottom: 0.5rem;">${escapeHtml(post.message || '')}</div>
          <div class="meta">
            ${t.meta_loc}: ${escapeHtml(post.location)} &bull; ${t.meta_time}: ${new Date(post.created_at).toLocaleString(lang, timeFormatOptions)}
          </div>
        </div>
      `).join('')}
    </div>
    
    <!-- Pagination Control -->
    <div class="pagination">
      ${prevLink}
      <span class="page-number">第 ${currentPage} 頁</span>
      ${nextLink}
    </div>
  </div>
</body>
</html>
  `;
}

function escapeHtml(unsafe) {
  if (!unsafe) return '';
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
