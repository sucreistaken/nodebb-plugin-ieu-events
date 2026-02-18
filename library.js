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

plugin.init = async function (params) {};

plugin.defineWidgets = async function (widgets) {
    widgets.push({
        widget: "ieu-events-widget",
        name: "IEU Etkinlikleri (Pro)",
        description: "Modern tasarımlı etkinlik slaytı.",
        content: ""
    });
    return widgets;
};

async function getEvents() {
    const cached = myCache.get("ieu_data_pro_v3");
    if (cached) return cached;

    try {
        console.log('[IEU Scraper] Siteye bağlanılıyor...');
        const { data } = await axios.get('https://club.ieu.edu.tr/etkinlikler', {
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

            // Düzeltmeler
            if (img && !img.startsWith('http')) img = 'https://club.ieu.edu.tr' + img;
            if (!img) img = 'https://club.ieu.edu.tr/sites/all/themes/ieu_theme/logo.png';

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

            // Slayt
            slidesHtml += `
                <div class="ieu-slide ${index === 0 ? 'active' : ''}" data-index="${index}">
                    <div class="ieu-slide-bg" style="background-image: url('${e.img}');"></div>
                    <div class="ieu-slide-content">
                        <div class="ieu-card-img" onclick="openIeuModal(${e.id})">
                            <img src="${e.img}">
                        </div>
                        <div class="ieu-card-info">
                            <span class="ieu-date-badge">${e.date}</span>
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

            // Modal
            modalsHtml += `
                <div id="ieuModal_${e.id}" class="ieu-modal-overlay" style="display:none;">
                    <div class="ieu-modal-box">
                        <div class="ieu-modal-header">
                            <h4>${e.title}</h4>
                            <span class="ieu-close-btn" onclick="closeIeuModal(${e.id})">&times;</span>
                        </div>
                        <div class="ieu-modal-body">
                            <div style="text-align:center; margin-bottom:15px;">
                                <img src="${e.img}" style="max-height:180px; border-radius:8px;">
                            </div>
                            <div style="background:#f8f9fa; padding:10px; border-radius:6px; margin-bottom:15px; font-size:13px; color:#555;">
                                <p><strong><i class="fa fa-clock-o"></i> Tarih:</strong> ${e.fullDate}</p>
                                <p><strong><i class="fa fa-map-marker"></i> Konum:</strong> ${e.location}</p>
                            </div>
                            <div style="font-size:14px; line-height:1.6; color:#333;">${e.fullDesc || 'Açıklama yok.'}</div>
                        </div>
                        <div class="ieu-modal-footer">
                            <button onclick="closeIeuModal(${e.id})">Kapat</button>
                        </div>
                    </div>
                </div>
            `;
        });

        // Final HTML (CSS + JS İçinde)
        const finalHtml = `
            <style>
                /* Widget Container */
                .ieu-widget-wrapper {
                    position: relative;
                    height: 320px;
                    overflow: hidden;
                    background: #2c3e50;
                    border-radius: 12px;
                    margin-bottom: 20px;
                    box-shadow: 0 5px 15px rgba(0,0,0,0.1);
                    border: 1px solid #ddd;
                }

                /* Slides */
                .ieu-slide {
                    position: absolute;
                    width: 100%;
                    height: 100%;
                    top: 0;
                    left: 0;
                    opacity: 0;
                    transition: opacity 0.6s ease-in-out;
                    pointer-events: none;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                .ieu-slide.active {
                    opacity: 1;
                    pointer-events: auto;
                    z-index: 2;
                }

                /* Background Blur */
                .ieu-slide-bg {
                    position: absolute;
                    inset: 0;
                    background-size: cover;
                    background-position: center;
                    filter: blur(15px) brightness(0.4);
                    z-index: 1;
                }

                /* Content */
                .ieu-slide-content {
                    position: relative;
                    z-index: 3;
                    display: flex;
                    align-items: center;
                    width: 90%;
                    max-width: 800px;
                    gap: 25px;
                }

                /* Image */
                .ieu-card-img {
                    width: 160px;
                    height: 220px;
                    flex-shrink: 0;
                    border-radius: 10px;
                    overflow: hidden;
                    box-shadow: 0 10px 25px rgba(0,0,0,0.5);
                    cursor: pointer;
                    border: 2px solid rgba(255,255,255,0.2);
                    transition: transform 0.3s;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: rgba(0,0,0,0.6);
                }
                .ieu-card-img:hover {
                    transform: scale(1.03);
                }
                .ieu-card-img img {
                    width: 100%;
                    height: auto;
                    max-height: 100%;
                    object-fit: contain;
                }

                /* Text */
                .ieu-card-info {
                    color: #fff;
                    flex: 1;
                    text-align: left;
                }
                .ieu-date-badge {
                    background: #f1c40f;
                    color: #2c3e50;
                    padding: 4px 8px;
                    border-radius: 4px;
                    font-size: 11px;
                    font-weight: 800;
                    text-transform: uppercase;
                    margin-bottom: 8px;
                    display: inline-block;
                }
                .ieu-card-title {
                    font-size: 18px;
                    margin: 0 0 10px 0;
                    font-weight: 700;
                    line-height: 1.3;
                    text-shadow: 0 2px 4px rgba(0,0,0,0.6);
                    cursor: pointer;

                    /* uzun başlıkları 2 satıra sabitle */
                    display: -webkit-box;
                    -webkit-line-clamp: 2;
                    -webkit-box-orient: vertical;
                    overflow: hidden;
                }
                .ieu-card-club {
                    font-size: 13px;
                    opacity: 0.9;
                    margin-bottom: 15px;
                    color: #bdc3c7;

                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                .ieu-btn-detail {
                    background: #3498db;
                    color: #fff;
                    border: none;
                    padding: 8px 20px;
                    border-radius: 20px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: background 0.2s;
                }
                .ieu-btn-detail:hover {
                    background: #2980b9;
                }

                /* Controls */
                .ieu-nav-btn {
                    position: absolute;
                    top: 50%;
                    transform: translateY(-50%);
                    z-index: 10;
                    background: rgba(0,0,0,0.3);
                    border: none;
                    color: #fff;
                    width: 40px;
                    height: 40px;
                    border-radius: 50%;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: background 0.2s;
                }
                .ieu-nav-btn:hover {
                    background: rgba(0,0,0,0.6);
                }
                .ieu-prev {
                    left: 15px;
                }
                .ieu-next {
                    right: 15px;
                }

                /* Modal (Popup) */
                .ieu-modal-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(0,0,0,0.8);
                    z-index: 10000;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    backdrop-filter: blur(5px);
                }
                .ieu-modal-box {
                    background: #fff;
                    width: 90%;
                    max-width: 600px;
                    max-height: 85vh;
                    border-radius: 12px;
                    overflow: hidden;
                    display: flex;
                    flex-direction: column;
                    box-shadow: 0 25px 50px rgba(0,0,0,0.5);
                    animation: ieuPop 0.3s ease-out;
                }
                .ieu-modal-header {
                    padding: 15px 20px;
                    background: #f8f9fa;
                    border-bottom: 1px solid #eee;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                .ieu-modal-header h4 {
                    margin: 0;
                    font-size: 16px;
                    font-weight: 700;
                    color: #333;
                }
                .ieu-close-btn {
                    font-size: 24px;
                    cursor: pointer;
                    color: #999;
                }
                .ieu-close-btn:hover {
                    color: #333;
                }
                .ieu-modal-body {
                    padding: 20px;
                    overflow-y: auto;
                    color: #444;
                }
                .ieu-modal-footer {
                    padding: 15px;
                    text-align: right;
                    border-top: 1px solid #eee;
                    background: #fff;
                }
                .ieu-modal-footer button {
                    background: #eee;
                    border: none;
                    padding: 8px 16px;
                    border-radius: 6px;
                    cursor: pointer;
                    color: #333;
                }

                @keyframes ieuPop {
                    from { transform: scale(0.9); opacity: 0; }
                    to { transform: scale(1); opacity: 1; }
                }

                /* Dar kolon / mobil uyumu */
                @media (max-width: 900px) {
                    .ieu-slide-content {
                        flex-direction: column;
                        text-align: center;
                    }
                    .ieu-card-info {
                        text-align: center;
                    }
                    .ieu-card-img {
                        width: 140px;
                        height: 180px;
                        margin: 0 auto 10px auto;
                        border-radius: 50%;
                    }
                    .ieu-widget-wrapper {
                        height: 380px;
                    }
                }
            </style>

            <div class="ieu-widget-wrapper">
                <div id="ieu-slider-inner">
                    ${slidesHtml}
                </div>
                <button class="ieu-nav-btn ieu-prev" onclick="ieuMoveSlide(-1)"><i class="fa fa-chevron-left"></i></button>
                <button class="ieu-nav-btn ieu-next" onclick="ieuMoveSlide(1)"><i class="fa fa-chevron-right"></i></button>
            </div>

            ${modalsHtml}

            <script>
                // Global Değişkenler (Çakışmayı önlemek için window scope)
                window.ieuCurrentSlide = 0;
                window.ieuTotalSlides = ${events.length};
                window.ieuAutoInterval = null;

                function ieuShowSlide(n) {
                    var slides = document.querySelectorAll('.ieu-slide');
                    if (!slides.length) return;

                    // Döngü mantığı
                    if (n >= window.ieuTotalSlides) window.ieuCurrentSlide = 0;
                    else if (n < 0) window.ieuCurrentSlide = window.ieuTotalSlides - 1;
                    else window.ieuCurrentSlide = n;

                    // Hepsini gizle, aktif olanı göster
                    slides.forEach(function (s) { s.classList.remove('active'); });
                    slides[window.ieuCurrentSlide].classList.add('active');
                }

                window.ieuMoveSlide = function (n) {
                    ieuShowSlide(window.ieuCurrentSlide + n);
                    resetIeuTimer();
                };

                function startIeuAuto() {
                    window.ieuAutoInterval = setInterval(function () {
                        ieuMoveSlide(1);
                    }, 5000);
                }

                function resetIeuTimer() {
                    clearInterval(window.ieuAutoInterval);
                    startIeuAuto();
                }

                window.openIeuModal = function (id) {
                    var el = document.getElementById('ieuModal_' + id);
                    if (el) {
                        el.style.display = 'flex';
                        document.body.style.overflow = 'hidden'; // Arka planı kilitle
                    }
                };

                window.closeIeuModal = function (id) {
                    var el = document.getElementById('ieuModal_' + id);
                    if (el) {
                        el.style.display = 'none';
                        document.body.style.overflow = 'auto'; // Kilidi aç
                    }
                };

                // Başlat
                setTimeout(function () {
                    ieuShowSlide(0);
                    startIeuAuto();
                }, 2000);
            </script>
        `;

        myCache.set("ieu_data_pro_v3", finalHtml);
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

module.exports = plugin;
