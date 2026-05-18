'use strict';

const axios = require('axios');
const cheerio = require('cheerio');
const NodeCache = require('node-cache');

// 1 saatlik önbellek
const myCache = new NodeCache({ stdTTL: 3600 });
const plugin = {};

const turkishMonths = {
    'ocak': 0, 'şubat': 1, 'mart': 2, 'nisan': 3,
    'mayıs': 4, 'haziran': 5, 'temmuz': 6, 'ağustos': 7,
    'eylül': 8, 'ekim': 9, 'kasım': 10, 'aralık': 11
};

function parseTurkishDate(dateStr) {
    if (!dateStr) return null;
    const parts = dateStr.trim().toLowerCase().match(/(\d{1,2})\s+([a-zçğıöşü]+)\s+(\d{4})/);
    if (!parts) return null;
    const day = parseInt(parts[1], 10);
    const month = turkishMonths[parts[2]];
    const year = parseInt(parts[3], 10);
    if (month === undefined || isNaN(day) || isNaN(year)) return null;
    return new Date(year, month, day, 23, 59, 59);
}

function parseTurkishDateNoYear(dateStr) {
    if (!dateStr) return null;
    const currentYear = new Date().getFullYear();
    const parts = dateStr.trim().toLowerCase().match(/(\d{1,2})\s+([a-zçğıöşü]+)/);
    if (!parts) return null;
    return parseTurkishDate(`${parts[1]} ${parts[2]} ${currentYear}`);
}

// Tüm dış kaynak URL'lerini forum.ieu.app reverse-proxy üzerinden geçirir.
// Okul ağında club.ieu.edu.tr / phoenix.ieu.edu.tr gibi domainler doğrudan
// açılmadığı için, görsel/bağlantıların hepsi kendi domainimizden servis edilir.
function proxify(url) {
    if (!url) return url;
    // protocol-relative -> https
    if (url.startsWith('//')) url = 'https:' + url;
    // root-relative: nginx sub_filter zaten bilinen domainleri /ext/ieu/...
    // şekline çevirdiği için sadece kendi origin'imizi eklemek yeterli
    if (url.startsWith('/')) return 'https://forum.ieu.app' + url;
    // mutlak okul domainleri -> nginx reverse-proxy yollarına çevir
    return url
        .replace(/^https?:\/\/club\.ieu\.edu\.tr(?=\/|$)/i, 'https://forum.ieu.app/ext/ieu/club')
        .replace(/^https?:\/\/(?:www\.)?ieu\.edu\.tr(?=\/|$)/i, 'https://forum.ieu.app/ext/ieu')
        .replace(/^https?:\/\/phoenix\.ieu\.edu\.tr(?=\/|$)/i, 'https://forum.ieu.app/ext/ieu/phoenix');
}

plugin.init = async function (params) { };

plugin.defineWidgets = async function (widgets) {
    widgets.push({
        widget: "ieu-events-widget",
        name: "IEU Etkinlikleri (Pro)",
        description: "Modern tasarımlı etkinlik slaytı.",
        content: ""
    });
    widgets.push({
        widget: "ieu-school-events-widget",
        name: "IEU Etkinlikleri (Okul)",
        description: "Okul etkinlikleri slaytı.",
        content: ""
    });
    return widgets;
};

async function getEvents() {
    const cached = myCache.get("ieu_data_pro_v4");
    if (cached) return cached;

    try {
        console.log('[IEU Scraper] Siteye bağlanılıyor...');
        const { data } = await axios.get('https://forum.ieu.app/ext/ieu/club/etkinlikler', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });

        const $ = cheerio.load(data);
        const events = [];

        $('.event-card').each((i, el) => {
            if (events.length >= 24) return;

            // Verileri Çek
            let img = $(el).find('.event-image img').attr('src');
            let date = $(el).find('.event-date').text().trim();
            let title = $(el).find('.card-title').text().trim();
            let club = $(el).find('.card-body > span').text().trim();
            let modalId = $(el).attr('data-bs-target');

            // Detaylar
            let fullDesc = "Detay yok.", location = "", fullDate = "";
            if (modalId) {
                let m = $(modalId);
                if (m.length) {
                    fullDesc = m.find('.event-info-label:contains("Program")').next('div').html();
                    location = m.find('.event-info-label:contains("Konum")').next('div').text();
                    fullDate = m.find('.event-info-label:contains("Tarih")').next('div').text();
                }
            }

            // URL'leri forum.ieu.app reverse-proxy üzerinden geçir
            img = proxify(img);
            if (!img) img = proxify('https://club.ieu.edu.tr/sites/all/themes/ieu_theme/logo.png');

            // Tarihi geçmiş etkinlikleri atla
            const eventDate = parseTurkishDate(fullDate);
            if (eventDate && eventDate < new Date()) return;

            if (title) events.push({ id: i, title, img, date, club, fullDesc, location, fullDate });
        });

        if (events.length === 0) {
            return '<div class="alert alert-warning">Etkinlik bulunamadı.</div>';
        }

        // Yardımcı: Başlık kısaltma
        function truncate(text, max) {
            if (!text) return '';
            return text.length > max ? text.slice(0, max - 1) + '…' : text;
        }

        // --- HTML & CSS & JS OLUŞTURMA ---
        let slidesHtml = '';
        let modalsHtml = '';

        events.forEach((e, index) => {
            const shortTitle = truncate(e.title, 80);
            const safeTitleAttr = (e.title || '').replace(/"/g, '&quot;');
            const safeClubAttr = (e.club || '').replace(/"/g, '&quot;');

            slidesHtml += `
                <div class="ieu-slide ${index === 0 ? 'active' : ''}" data-index="${index}">
                    <div class="ieu-slide-bg" style="background-image: url('${e.img}');"></div>
                    <div class="ieu-slide-gradient"></div>
                    <div class="ieu-slide-content">
                        <div class="ieu-card-img" onclick="openIeuModal(${e.id})">
                            <img src="${e.img}">
                        </div>
                        <div class="ieu-card-info">
                            <div class="ieu-badges">
                                <span class="ieu-date-badge">${e.date}</span>
                            </div>
                            <h3 class="ieu-card-title"
                                title="${safeTitleAttr}"
                                onclick="openIeuModal(${e.id})">${shortTitle}</h3>
                            <div class="ieu-card-club" title="${safeClubAttr}">
                                <i class="fa fa-users"></i> ${e.club}
                            </div>
                            <button class="ieu-btn-detail" onclick="openIeuModal(${e.id})">İncele</button>
                        </div>
                    </div>
                </div>
            `;

            modalsHtml += `
                <div id="ieuModal_${e.id}" class="ieu-modal-overlay" style="display:none;">
                    <div class="ieu-modal-box">
                        <div class="ieu-modal-header">
                            <h4>${e.title}</h4>
                            <span class="ieu-close-btn" onclick="closeIeuModal(${e.id})">&times;</span>
                        </div>
                        <div class="ieu-modal-body">
                            <div style="text-align:center; margin-bottom:16px;">
                                <img src="${e.img}">
                            </div>
                            <div class="ieu-modal-meta">
                                ${e.club ? `<p><strong><i class="fa fa-users"></i> Kulüp:</strong> ${e.club}</p>` : ''}
                                ${e.fullDate ? `<p><strong><i class="fa fa-calendar"></i> Tarih:</strong> ${e.fullDate}</p>` : ''}
                                ${e.location ? `<p><strong><i class="fa fa-map-marker"></i> Konum:</strong> ${e.location}</p>` : ''}
                            </div>
                            <div style="font-size:14px; line-height:1.7; color:#333;">${e.fullDesc || 'Açıklama yok.'}</div>
                        </div>
                        <div class="ieu-modal-footer">
                            <button onclick="closeIeuModal(${e.id})">Kapat</button>
                        </div>
                    </div>
                </div>
            `;
        });

        const dotsHtml = events.map((e, index) =>
            `<span class="ieu-dot ${index === 0 ? 'active' : ''}" onclick="ieuGoToSlide(${index})"></span>`
        ).join('');

        const finalHtml = `
            <style>
                .ieu-widget-wrapper {
                    position: relative;
                    height: 526px;
                    overflow: hidden;
                    background: linear-gradient(160deg, #1a3a3a 0%, #0d2222 100%);
                    border-radius: 16px;
                    margin-bottom: 20px;
                    box-shadow: 0 4px 20px rgba(0,0,0,0.15);
                }
                .ieu-widget-title {
                    position: absolute;
                    top: 0; left: 0; right: 0;
                    height: 46px;
                    z-index: 20;
                    display: flex;
                    align-items: center;
                    gap: 9px;
                    padding: 0 16px;
                    box-sizing: border-box;
                    background: linear-gradient(180deg, #1f4443 0%, #163433 100%);
                    border-bottom: 1px solid rgba(255,255,255,0.08);
                    color: #fff;
                    font-size: 13px;
                    font-weight: 700;
                    letter-spacing: 0.06em;
                }
                .ieu-widget-title i {
                    color: #2ecc71;
                    font-size: 14px;
                }
                .ieu-slide {
                    position: absolute;
                    width: 100%;
                    height: calc(100% - 46px);
                    top: 46px; left: 0;
                    opacity: 0;
                    transition: opacity 0.6s ease;
                    pointer-events: none;
                }
                .ieu-slide.active {
                    opacity: 1;
                    pointer-events: auto;
                    z-index: 2;
                }
                .ieu-slide-bg {
                    position: absolute;
                    inset: 0;
                    background-size: cover;
                    background-position: center;
                    filter: blur(20px) brightness(0.3);
                    transform: scale(1.15);
                    z-index: 1;
                }
                .ieu-slide-gradient {
                    position: absolute;
                    inset: 0;
                    background: linear-gradient(180deg,
                        rgba(15,34,34,0.2) 0%,
                        rgba(15,34,34,0.05) 30%,
                        rgba(15,34,34,0.5) 65%,
                        rgba(15,34,34,0.95) 100%);
                    z-index: 2;
                }
                .ieu-slide-content {
                    position: relative;
                    z-index: 3;
                    display: flex;
                    flex-direction: column;
                    height: 100%;
                    padding: 18px 18px 50px 18px;
                    box-sizing: border-box;
                }
                .ieu-card-img {
                    width: 100%;
                    height: 200px;
                    flex-shrink: 0;
                    border-radius: 12px;
                    overflow: hidden;
                    cursor: pointer;
                    box-shadow: 0 6px 20px rgba(0,0,0,0.4);
                    border: 1px solid rgba(255,255,255,0.08);
                    transition: transform 0.3s;
                }
                .ieu-card-img:hover { transform: scale(1.02); }
                .ieu-card-img img {
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                }
                .ieu-card-info {
                    color: #fff;
                    width: 100%;
                    text-align: left;
                    margin-top: 14px;
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    min-height: 0;
                }
                .ieu-badges {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 6px;
                    margin-bottom: 10px;
                }
                .ieu-date-badge {
                    background: #2ecc71;
                    color: #fff;
                    padding: 4px 10px;
                    border-radius: 5px;
                    font-size: 11px;
                    font-weight: 700;
                    text-transform: uppercase;
                }
                .ieu-type-badge {
                    background: rgba(255,255,255,0.12);
                    color: rgba(255,255,255,0.85);
                    padding: 4px 10px;
                    border-radius: 5px;
                    font-size: 11px;
                    font-weight: 600;
                    border: 1px solid rgba(255,255,255,0.08);
                }
                .ieu-card-title {
                    font-size: 17px;
                    margin: 0 0 6px 0;
                    font-weight: 700;
                    line-height: 1.35;
                    cursor: pointer;
                    display: -webkit-box;
                    -webkit-line-clamp: 2;
                    -webkit-box-orient: vertical;
                    overflow: hidden;
                    text-shadow: 0 1px 4px rgba(0,0,0,0.4);
                    transition: color 0.2s;
                }
                .ieu-card-title:hover { color: #2ecc71; }
                .ieu-card-club {
                    font-size: 13px;
                    line-height: 1.45;
                    color: rgba(255,255,255,0.6);
                    display: -webkit-box;
                    -webkit-line-clamp: 2;
                    -webkit-box-orient: vertical;
                    overflow: hidden;
                    margin-bottom: auto;
                }
                .ieu-btn-detail {
                    align-self: flex-start;
                    background: linear-gradient(135deg, #2ecc71, #27ae60);
                    color: #fff;
                    border: none;
                    padding: 9px 24px;
                    border-radius: 22px;
                    font-size: 13px;
                    font-weight: 600;
                    cursor: pointer;
                    margin-top: 12px;
                    transition: transform 0.2s, box-shadow 0.2s;
                    box-shadow: 0 3px 12px rgba(46,204,113,0.25);
                }
                .ieu-btn-detail:hover {
                    transform: translateY(-1px);
                    box-shadow: 0 5px 16px rgba(46,204,113,0.4);
                }
                /* Bottom bar: nav + dots */
                .ieu-bottom-bar {
                    position: absolute;
                    bottom: 0;
                    left: 0;
                    right: 0;
                    z-index: 10;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 10px 14px;
                    gap: 10px;
                }
                .ieu-nav-btn {
                    background: rgba(255,255,255,0.1);
                    border: 1px solid rgba(255,255,255,0.12);
                    color: #fff;
                    width: 30px;
                    height: 30px;
                    border-radius: 50%;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 12px;
                    flex-shrink: 0;
                    transition: background 0.2s;
                }
                .ieu-nav-btn:hover { background: rgba(255,255,255,0.2); }
                .ieu-dots {
                    display: flex;
                    gap: 5px;
                    flex-wrap: wrap;
                    justify-content: center;
                }
                .ieu-dot {
                    width: 7px;
                    height: 7px;
                    border-radius: 50%;
                    background: rgba(255,255,255,0.25);
                    cursor: pointer;
                    transition: background 0.3s, transform 0.3s;
                }
                .ieu-dot.active {
                    background: #2ecc71;
                    transform: scale(1.4);
                }
                .ieu-dot:hover { background: rgba(255,255,255,0.5); }
                .ieu-counter {
                    position: absolute;
                    top: 60px;
                    right: 14px;
                    z-index: 10;
                    background: rgba(0,0,0,0.45);
                    color: rgba(255,255,255,0.75);
                    padding: 3px 10px;
                    border-radius: 10px;
                    font-size: 11px;
                    font-weight: 600;
                    backdrop-filter: blur(4px);
                }

                /* Modal */
                .ieu-modal-overlay {
                    position: fixed;
                    top: 0; left: 0;
                    width: 100%; height: 100%;
                    background: rgba(0,0,0,0.85);
                    z-index: 10000;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    backdrop-filter: blur(6px);
                }
                .ieu-modal-box {
                    background: #fff;
                    width: 92%;
                    max-width: 600px;
                    max-height: 88vh;
                    border-radius: 14px;
                    overflow: hidden;
                    display: flex;
                    flex-direction: column;
                    box-shadow: 0 20px 50px rgba(0,0,0,0.5);
                    animation: ieuPop 0.3s ease-out;
                }
                .ieu-modal-header {
                    padding: 16px 20px;
                    background: linear-gradient(135deg, #f0faf4, #e8f5ec);
                    border-bottom: 1px solid #d4edda;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                .ieu-modal-header h4 {
                    margin: 0;
                    font-size: 16px;
                    font-weight: 700;
                    color: #1a3a3a;
                    line-height: 1.4;
                    flex: 1;
                    padding-right: 10px;
                }
                .ieu-close-btn {
                    font-size: 26px;
                    cursor: pointer;
                    color: #999;
                    line-height: 1;
                    transition: color 0.2s;
                }
                .ieu-close-btn:hover { color: #333; }
                .ieu-modal-body {
                    padding: 20px;
                    overflow-y: auto;
                    color: #444;
                }
                .ieu-modal-body img {
                    max-height: 200px;
                    border-radius: 10px;
                }
                .ieu-modal-meta {
                    background: #f0faf4;
                    padding: 12px 14px;
                    border-radius: 8px;
                    margin-bottom: 14px;
                    font-size: 13px;
                    color: #555;
                    border: 1px solid #e0f0e6;
                }
                .ieu-modal-meta p { margin: 3px 0; }
                .ieu-modal-meta i { width: 16px; color: #27ae60; }
                .ieu-modal-footer {
                    padding: 14px 20px;
                    border-top: 1px solid #eee;
                    background: #fafafa;
                    display: flex;
                    justify-content: flex-end;
                    gap: 10px;
                }
                .ieu-modal-footer button {
                    background: #eee;
                    border: none;
                    padding: 9px 18px;
                    border-radius: 8px;
                    cursor: pointer;
                    color: #333;
                    font-weight: 500;
                }
                .ieu-modal-footer button:hover { background: #ddd; }
                .ieu-btn-link {
                    background: linear-gradient(135deg, #2ecc71, #27ae60);
                    color: #fff;
                    border: none;
                    padding: 9px 18px;
                    border-radius: 8px;
                    cursor: pointer;
                    text-decoration: none;
                    font-size: 14px;
                    font-weight: 600;
                    transition: transform 0.2s;
                }
                .ieu-btn-link:hover { transform: translateY(-1px); }
                @keyframes ieuPop {
                    from { transform: scale(0.92); opacity: 0; }
                    to { transform: scale(1); opacity: 1; }
                }
            </style>

            <div class="ieu-widget-wrapper">
                <div class="ieu-widget-title"><i class="fa fa-users"></i><span>KULÜP ETKİNLİKLERİ</span></div>
                <div id="ieu-slider-inner">
                    ${slidesHtml}
                </div>
                <div class="ieu-counter" id="ieu-counter">1 / ${events.length}</div>
                <div class="ieu-bottom-bar">
                    <button class="ieu-nav-btn" onclick="ieuMoveSlide(-1)"><i class="fa fa-chevron-left"></i></button>
                    <div class="ieu-dots">${dotsHtml}</div>
                    <button class="ieu-nav-btn" onclick="ieuMoveSlide(1)"><i class="fa fa-chevron-right"></i></button>
                </div>
            </div>

            ${modalsHtml}

            <script>
                // Önceki instance'ları temizle (AJAX navigasyon için)
                clearInterval(window.ieuAutoInterval);
                clearTimeout(window.ieuAutoTimeout);
                window.ieuAutoInterval = null;
                window.ieuAutoTimeout = null;

                window.ieuCurrentSlide = 0;
                window.ieuTotalSlides = ${events.length};

                function ieuShowSlide(n) {
                    var slides = document.querySelectorAll('.ieu-slide');
                    var dots = document.querySelectorAll('.ieu-dot');
                    var counter = document.getElementById('ieu-counter');
                    if (!slides.length) return;
                    if (n >= window.ieuTotalSlides) window.ieuCurrentSlide = 0;
                    else if (n < 0) window.ieuCurrentSlide = window.ieuTotalSlides - 1;
                    else window.ieuCurrentSlide = n;
                    slides.forEach(function (s) { s.classList.remove('active'); });
                    slides[window.ieuCurrentSlide].classList.add('active');
                    dots.forEach(function (d) { d.classList.remove('active'); });
                    if (dots[window.ieuCurrentSlide]) dots[window.ieuCurrentSlide].classList.add('active');
                    if (counter) counter.textContent = (window.ieuCurrentSlide + 1) + ' / ' + window.ieuTotalSlides;
                }

                window.ieuMoveSlide = function (n) {
                    ieuShowSlide(window.ieuCurrentSlide + n);
                    ieuResetTimer();
                };

                window.ieuGoToSlide = function (n) {
                    ieuShowSlide(n);
                    ieuResetTimer();
                };

                function ieuStartAuto() {
                    clearInterval(window.ieuAutoInterval);
                    window.ieuAutoInterval = setInterval(function () {
                        ieuShowSlide(window.ieuCurrentSlide + 1);
                    }, 5000);
                }

                function ieuResetTimer() {
                    clearInterval(window.ieuAutoInterval);
                    ieuStartAuto();
                }

                window.openIeuModal = function (id) {
                    var el = document.getElementById('ieuModal_' + id);
                    if (el) {
                        el.style.display = 'flex';
                        document.body.style.overflow = 'hidden';
                        clearInterval(window.ieuAutoInterval);
                    }
                };

                window.closeIeuModal = function (id) {
                    var el = document.getElementById('ieuModal_' + id);
                    if (el) {
                        el.style.display = 'none';
                        document.body.style.overflow = 'auto';
                        ieuResetTimer();
                    }
                };

                window.ieuAutoTimeout = setTimeout(function () {
                    ieuShowSlide(0);
                    ieuStartAuto();
                }, 2000);
            </script>
        `;

        myCache.set("ieu_data_pro_v4", finalHtml);
        return finalHtml;

    } catch (e) {
        console.error('[IEU Scraper] Hata:', e.message);
        return '<div class="alert alert-danger">Veri çekilemedi.</div>';
    }
}

plugin.renderWidget = async function (widget) {
    widget.html = await getEvents();
    return widget;
};

async function getSchoolEvents() {
    const cached = myCache.get("ieu_school_events_v1");
    if (cached) return cached;

    try {
        console.log('[IEU School Scraper] Siteye bağlanılıyor...');
        const { data } = await axios.get('https://forum.ieu.app/ext/ieu/tr/events/type/all', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });

        const $ = cheerio.load(data);
        const events = [];
        const now = new Date();

        $('.filtr-item').each((i, el) => {
            if (events.length >= 24) return;

            const title = $(el).find('h3.service-heading').text().trim();
            const dateText = $(el).find('span.fs-20.lh-12').first().text().trim();
            let img = $(el).find('img.img-fluid').attr('src') || '';
            const description = $(el).find('p.text-muted.newstext-length').text().trim();
            const location = $(el).find('p.text-dark.fw-bold').filter(function () {
                return $(this).find('i.fa-map-marker').length > 0;
            }).text().trim();
            const eventType = $(el).find('strong.float-end').text().trim();
            const link = $(el).find('a[href*="/read/id/"]').attr('href') || '';

            // Tarihi geçmiş etkinlikleri atla
            const eventDate = parseTurkishDateNoYear(dateText);
            if (eventDate && eventDate < now) return;

            // URL'leri forum.ieu.app reverse-proxy üzerinden geçir
            img = proxify(img);
            if (!img) img = proxify('https://www.ieu.edu.tr/assets/ieu/images/logo/ieu-logo.png');
            const fullLink = proxify(link);

            if (title) {
                events.push({
                    id: i,
                    title,
                    img,
                    date: dateText,
                    description: description || 'Açıklama yok.',
                    location,
                    eventType,
                    link: fullLink
                });
            }
        });

        if (events.length === 0) {
            return '<div class="alert alert-warning">Okul etkinliği bulunamadı.</div>';
        }

        function truncate(text, max) {
            if (!text) return '';
            return text.length > max ? text.slice(0, max - 1) + '…' : text;
        }

        let slidesHtml = '';
        let modalsHtml = '';

        events.forEach((e, index) => {
            const shortTitle = truncate(e.title, 80);
            const safeTitleAttr = (e.title || '').replace(/"/g, '&quot;');
            const shortDesc = truncate(e.description, 120);

            slidesHtml += `
                <div class="ieus-slide ${index === 0 ? 'active' : ''}" data-index="${index}">
                    <div class="ieus-slide-bg" style="background-image: url('${e.img}');"></div>
                    <div class="ieus-slide-gradient"></div>
                    <div class="ieus-slide-content">
                        <div class="ieus-card-img" onclick="ieusOpenModal(${e.id})">
                            <img src="${e.img}">
                        </div>
                        <div class="ieus-card-info">
                            <div class="ieus-badges">
                                <span class="ieus-date-badge">${e.date}</span>
                                ${e.eventType ? `<span class="ieus-type-badge">${e.eventType}</span>` : ''}
                            </div>
                            <h3 class="ieus-card-title"
                                title="${safeTitleAttr}"
                                onclick="ieusOpenModal(${e.id})">${shortTitle}</h3>
                            <div class="ieus-card-desc">${shortDesc}</div>
                            <button class="ieus-btn-detail" onclick="ieusOpenModal(${e.id})">İncele</button>
                        </div>
                    </div>
                </div>
            `;

            modalsHtml += `
                <div id="ieusModal_${e.id}" class="ieus-modal-overlay" style="display:none;">
                    <div class="ieus-modal-box">
                        <div class="ieus-modal-header">
                            <h4>${e.title}</h4>
                            <span class="ieus-close-btn" onclick="ieusCloseModal(${e.id})">&times;</span>
                        </div>
                        <div class="ieus-modal-body">
                            <div style="text-align:center; margin-bottom:16px;">
                                <img src="${e.img}">
                            </div>
                            <div class="ieus-modal-meta">
                                ${e.eventType ? `<p><strong><i class="fa fa-tag"></i> Tür:</strong> ${e.eventType}</p>` : ''}
                                <p><strong><i class="fa fa-calendar"></i> Tarih:</strong> ${e.date}</p>
                                ${e.location ? `<p><strong><i class="fa fa-map-marker"></i> Konum:</strong> ${e.location}</p>` : ''}
                            </div>
                            <div style="font-size:14px; line-height:1.7; color:#333;">${e.description}</div>
                        </div>
                        <div class="ieus-modal-footer">
                            ${e.link ? `<a href="${e.link}" target="_blank" class="ieus-btn-link">Detaylı Bilgi</a>` : ''}
                            <button onclick="ieusCloseModal(${e.id})">Kapat</button>
                        </div>
                    </div>
                </div>
            `;
        });

        const dotsHtml = events.map((e, index) =>
            `<span class="ieus-dot ${index === 0 ? 'active' : ''}" onclick="ieusGoToSlide(${index})"></span>`
        ).join('');

        const finalHtml = `
            <style>
                .ieus-widget-wrapper {
                    position: relative;
                    height: 526px;
                    overflow: hidden;
                    background: linear-gradient(160deg, #1a3a3a 0%, #0d2222 100%);
                    border-radius: 16px;
                    margin-bottom: 20px;
                    box-shadow: 0 4px 20px rgba(0,0,0,0.15);
                }
                .ieus-widget-title {
                    position: absolute;
                    top: 0; left: 0; right: 0;
                    height: 46px;
                    z-index: 20;
                    display: flex;
                    align-items: center;
                    gap: 9px;
                    padding: 0 16px;
                    box-sizing: border-box;
                    background: linear-gradient(180deg, #1f4443 0%, #163433 100%);
                    border-bottom: 1px solid rgba(255,255,255,0.08);
                    color: #fff;
                    font-size: 13px;
                    font-weight: 700;
                    letter-spacing: 0.06em;
                }
                .ieus-widget-title i {
                    color: #2ecc71;
                    font-size: 14px;
                }
                .ieus-slide {
                    position: absolute;
                    width: 100%;
                    height: calc(100% - 46px);
                    top: 46px; left: 0;
                    opacity: 0;
                    transition: opacity 0.6s ease;
                    pointer-events: none;
                }
                .ieus-slide.active {
                    opacity: 1;
                    pointer-events: auto;
                    z-index: 2;
                }
                .ieus-slide-bg {
                    position: absolute;
                    inset: 0;
                    background-size: cover;
                    background-position: center;
                    filter: blur(20px) brightness(0.3);
                    transform: scale(1.15);
                    z-index: 1;
                }
                .ieus-slide-gradient {
                    position: absolute;
                    inset: 0;
                    background: linear-gradient(180deg,
                        rgba(15,34,34,0.2) 0%,
                        rgba(15,34,34,0.05) 30%,
                        rgba(15,34,34,0.5) 65%,
                        rgba(15,34,34,0.95) 100%);
                    z-index: 2;
                }
                .ieus-slide-content {
                    position: relative;
                    z-index: 3;
                    display: flex;
                    flex-direction: column;
                    height: 100%;
                    padding: 18px 18px 50px 18px;
                    box-sizing: border-box;
                }
                .ieus-card-img {
                    width: 100%;
                    height: 200px;
                    flex-shrink: 0;
                    border-radius: 12px;
                    overflow: hidden;
                    cursor: pointer;
                    box-shadow: 0 6px 20px rgba(0,0,0,0.4);
                    border: 1px solid rgba(255,255,255,0.08);
                    transition: transform 0.3s;
                }
                .ieus-card-img:hover { transform: scale(1.02); }
                .ieus-card-img img {
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                }
                .ieus-card-info {
                    color: #fff;
                    width: 100%;
                    text-align: left;
                    margin-top: 14px;
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    min-height: 0;
                }
                .ieus-badges {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 6px;
                    margin-bottom: 10px;
                }
                .ieus-date-badge {
                    background: #2ecc71;
                    color: #fff;
                    padding: 4px 10px;
                    border-radius: 5px;
                    font-size: 11px;
                    font-weight: 700;
                    text-transform: uppercase;
                }
                .ieus-type-badge {
                    background: rgba(255,255,255,0.12);
                    color: rgba(255,255,255,0.85);
                    padding: 4px 10px;
                    border-radius: 5px;
                    font-size: 11px;
                    font-weight: 600;
                    border: 1px solid rgba(255,255,255,0.08);
                }
                .ieus-card-title {
                    font-size: 17px;
                    margin: 0 0 6px 0;
                    font-weight: 700;
                    line-height: 1.35;
                    cursor: pointer;
                    display: -webkit-box;
                    -webkit-line-clamp: 2;
                    -webkit-box-orient: vertical;
                    overflow: hidden;
                    text-shadow: 0 1px 4px rgba(0,0,0,0.4);
                    transition: color 0.2s;
                }
                .ieus-card-title:hover { color: #2ecc71; }
                .ieus-card-desc {
                    font-size: 13px;
                    line-height: 1.45;
                    color: rgba(255,255,255,0.6);
                    display: -webkit-box;
                    -webkit-line-clamp: 2;
                    -webkit-box-orient: vertical;
                    overflow: hidden;
                    margin-bottom: auto;
                }
                .ieus-btn-detail {
                    align-self: flex-start;
                    background: linear-gradient(135deg, #2ecc71, #27ae60);
                    color: #fff;
                    border: none;
                    padding: 9px 24px;
                    border-radius: 22px;
                    font-size: 13px;
                    font-weight: 600;
                    cursor: pointer;
                    margin-top: 12px;
                    transition: transform 0.2s, box-shadow 0.2s;
                    box-shadow: 0 3px 12px rgba(46,204,113,0.25);
                }
                .ieus-btn-detail:hover {
                    transform: translateY(-1px);
                    box-shadow: 0 5px 16px rgba(46,204,113,0.4);
                }

                /* Bottom bar: nav + dots */
                .ieus-bottom-bar {
                    position: absolute;
                    bottom: 0;
                    left: 0;
                    right: 0;
                    z-index: 10;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 10px 14px;
                    gap: 10px;
                }
                .ieus-nav-btn {
                    background: rgba(255,255,255,0.1);
                    border: 1px solid rgba(255,255,255,0.12);
                    color: #fff;
                    width: 30px;
                    height: 30px;
                    border-radius: 50%;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 12px;
                    flex-shrink: 0;
                    transition: background 0.2s;
                }
                .ieus-nav-btn:hover { background: rgba(255,255,255,0.2); }
                .ieus-dots {
                    display: flex;
                    gap: 5px;
                    flex-wrap: wrap;
                    justify-content: center;
                }
                .ieus-dot {
                    width: 7px;
                    height: 7px;
                    border-radius: 50%;
                    background: rgba(255,255,255,0.25);
                    cursor: pointer;
                    transition: background 0.3s, transform 0.3s;
                }
                .ieus-dot.active {
                    background: #2ecc71;
                    transform: scale(1.4);
                }
                .ieus-dot:hover { background: rgba(255,255,255,0.5); }
                .ieus-counter {
                    position: absolute;
                    top: 60px;
                    right: 14px;
                    z-index: 10;
                    background: rgba(0,0,0,0.45);
                    color: rgba(255,255,255,0.75);
                    padding: 3px 10px;
                    border-radius: 10px;
                    font-size: 11px;
                    font-weight: 600;
                    backdrop-filter: blur(4px);
                }

                /* Modal */
                .ieus-modal-overlay {
                    position: fixed;
                    top: 0; left: 0;
                    width: 100%; height: 100%;
                    background: rgba(0,0,0,0.85);
                    z-index: 10000;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    backdrop-filter: blur(6px);
                }
                .ieus-modal-box {
                    background: #fff;
                    width: 92%;
                    max-width: 600px;
                    max-height: 88vh;
                    border-radius: 14px;
                    overflow: hidden;
                    display: flex;
                    flex-direction: column;
                    box-shadow: 0 20px 50px rgba(0,0,0,0.5);
                    animation: ieusPop 0.3s ease-out;
                }
                .ieus-modal-header {
                    padding: 16px 20px;
                    background: linear-gradient(135deg, #f0faf4, #e8f5ec);
                    border-bottom: 1px solid #d4edda;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                .ieus-modal-header h4 {
                    margin: 0;
                    font-size: 16px;
                    font-weight: 700;
                    color: #1a3a3a;
                    line-height: 1.4;
                    flex: 1;
                    padding-right: 10px;
                }
                .ieus-close-btn {
                    font-size: 26px;
                    cursor: pointer;
                    color: #999;
                    line-height: 1;
                    transition: color 0.2s;
                }
                .ieus-close-btn:hover { color: #333; }
                .ieus-modal-body {
                    padding: 20px;
                    overflow-y: auto;
                    color: #444;
                }
                .ieus-modal-body img {
                    max-height: 200px;
                    border-radius: 10px;
                }
                .ieus-modal-meta {
                    background: #f0faf4;
                    padding: 12px 14px;
                    border-radius: 8px;
                    margin-bottom: 14px;
                    font-size: 13px;
                    color: #555;
                    border: 1px solid #e0f0e6;
                }
                .ieus-modal-meta p { margin: 3px 0; }
                .ieus-modal-meta i { width: 16px; color: #27ae60; }
                .ieus-modal-footer {
                    padding: 14px 20px;
                    border-top: 1px solid #eee;
                    background: #fafafa;
                    display: flex;
                    justify-content: flex-end;
                    gap: 10px;
                }
                .ieus-modal-footer button {
                    background: #eee;
                    border: none;
                    padding: 9px 18px;
                    border-radius: 8px;
                    cursor: pointer;
                    color: #333;
                    font-weight: 500;
                }
                .ieus-modal-footer button:hover { background: #ddd; }
                .ieus-btn-link {
                    background: linear-gradient(135deg, #2ecc71, #27ae60);
                    color: #fff;
                    border: none;
                    padding: 9px 18px;
                    border-radius: 8px;
                    cursor: pointer;
                    text-decoration: none;
                    font-size: 14px;
                    font-weight: 600;
                    transition: transform 0.2s;
                }
                .ieus-btn-link:hover { transform: translateY(-1px); }
                @keyframes ieusPop {
                    from { transform: scale(0.92); opacity: 0; }
                    to { transform: scale(1); opacity: 1; }
                }
            </style>

            <div class="ieus-widget-wrapper">
                <div class="ieus-widget-title"><i class="fa fa-graduation-cap"></i><span>OKUL ETKİNLİKLERİ</span></div>
                <div id="ieus-slider-inner">
                    ${slidesHtml}
                </div>
                <div class="ieus-counter" id="ieus-counter">1 / ${events.length}</div>
                <div class="ieus-bottom-bar">
                    <button class="ieus-nav-btn" onclick="ieusMoveSlide(-1)"><i class="fa fa-chevron-left"></i></button>
                    <div class="ieus-dots">${dotsHtml}</div>
                    <button class="ieus-nav-btn" onclick="ieusMoveSlide(1)"><i class="fa fa-chevron-right"></i></button>
                </div>
            </div>

            ${modalsHtml}

            <script>
                // Önceki instance'ları temizle (AJAX navigasyon için)
                clearInterval(window.ieusAutoInterval);
                clearTimeout(window.ieusAutoTimeout);
                window.ieusAutoInterval = null;
                window.ieusAutoTimeout = null;

                window.ieusCurrentSlide = 0;
                window.ieusTotalSlides = ${events.length};

                function ieusShowSlide(n) {
                    var slides = document.querySelectorAll('.ieus-slide');
                    var dots = document.querySelectorAll('.ieus-dot');
                    var counter = document.getElementById('ieus-counter');
                    if (!slides.length) return;
                    if (n >= window.ieusTotalSlides) window.ieusCurrentSlide = 0;
                    else if (n < 0) window.ieusCurrentSlide = window.ieusTotalSlides - 1;
                    else window.ieusCurrentSlide = n;
                    slides.forEach(function (s) { s.classList.remove('active'); });
                    slides[window.ieusCurrentSlide].classList.add('active');
                    dots.forEach(function (d) { d.classList.remove('active'); });
                    if (dots[window.ieusCurrentSlide]) dots[window.ieusCurrentSlide].classList.add('active');
                    if (counter) counter.textContent = (window.ieusCurrentSlide + 1) + ' / ' + window.ieusTotalSlides;
                }

                window.ieusMoveSlide = function (n) {
                    ieusShowSlide(window.ieusCurrentSlide + n);
                    ieusResetTimer();
                };

                window.ieusGoToSlide = function (n) {
                    ieusShowSlide(n);
                    ieusResetTimer();
                };

                function ieusStartAuto() {
                    clearInterval(window.ieusAutoInterval);
                    window.ieusAutoInterval = setInterval(function () {
                        ieusShowSlide(window.ieusCurrentSlide + 1);
                    }, 5000);
                }

                function ieusResetTimer() {
                    clearInterval(window.ieusAutoInterval);
                    ieusStartAuto();
                }

                window.ieusOpenModal = function (id) {
                    var el = document.getElementById('ieusModal_' + id);
                    if (el) {
                        el.style.display = 'flex';
                        document.body.style.overflow = 'hidden';
                        clearInterval(window.ieusAutoInterval);
                    }
                };

                window.ieusCloseModal = function (id) {
                    var el = document.getElementById('ieusModal_' + id);
                    if (el) {
                        el.style.display = 'none';
                        document.body.style.overflow = 'auto';
                        ieusResetTimer();
                    }
                };

                window.ieusAutoTimeout = setTimeout(function () {
                    ieusShowSlide(0);
                    ieusStartAuto();
                }, 2000);
            </script>
        `;

        myCache.set("ieu_school_events_v1", finalHtml);
        return finalHtml;

    } catch (e) {
        console.error('[IEU School Scraper] Hata:', e.message);
        return '<div class="alert alert-danger">Okul etkinlikleri çekilemedi.</div>';
    }
}

plugin.renderSchoolWidget = async function (widget) {
    widget.html = await getSchoolEvents();
    return widget;
};

module.exports = plugin;
