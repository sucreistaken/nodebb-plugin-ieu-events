# IEU Events Widget 

IEU Events Widget  is a Node.js plugin that automatically retrieves **Izmir University of Economics (IEU)** club events from the official university website and displays them as a **modern, slider-based widget**.

## 🚀 Features

- 🔄 Automatically fetches IEU events from  
  **https://club.ieu.edu.tr/etkinlikler**
- 🧠 **1-hour in-memory caching** for improved performance
- 🎞️ Auto-playing **slider (carousel)** layout
- 🖼️ Modern UI with blurred background effects
- 📅 Displays event date, title, club name, and image
- 🔍 Detailed event view via **modal (popup)**
- 📱 Fully responsive (mobile & narrow columns)
- ⚡ No external CSS or JS dependencies required

## 📦 Technologies Used

- **Node.js**
- **Axios** – HTTP requests
- **Cheerio** – HTML parsing / scraping
- **node-cache** – In-memory caching
- Vanilla **HTML / CSS / JavaScript**

## 🧩 Widget Information

- **Widget ID:** `ieu-events-widget`
- **Widget Name:** IEU Events 
- **Description:** Modern event slider widget

## ⚙️ Installation

1. Place the plugin files inside your NodeBB plugin directory.
2. Install required dependencies:

```bash
npm install axios cheerio node-cache
Enable the plugin from the NodeBB Admin Panel.

Add the IEU Events (Pro) widget from the Widget Manager.

🛠️ How It Works
When the widget is rendered, the getEvents() function is executed.

If cached data exists, it is returned immediately.

If not cached:

The IEU events page is requested

Event cards are parsed from the HTML

A maximum of 24 events is collected

A single HTML output (including CSS & JS) is generated.

The result is cached for 1 hour.

⏱️ Cache Configuration
Default cache duration:


const myCache = new NodeCache({ stdTTL: 3600 });
You can adjust the duration (in seconds) if needed.

🖼️ Media & Content Notes
If an event image is missing, the default IEU logo is used

Long titles are automatically truncated

Modals display full date, location, and detailed description

⚠️ Disclaimer
This plugin uses web scraping.
If the IEU website’s HTML structure changes, selectors may need to be updated.

📄 License
This project is intended for private or institutional use.
Distribution and commercial usage rights belong to the project owner.