# Create Someecards Calendar Data

Scrape ecard embed codes from [Someecards.com](https://someecards.com).
Built with NodeJS and [Puppeteer](https://github.com/puppeteer/puppeteer).

This code creates a JSON file with dates and Someecard ecard embed codes in multiple steps:
1. Creates an array of calendar dates.
2. Iterates array of dates, and attaches a random Somecards ecard url from a JSON feed provided by the ["Get-Someecards-Meme-Links"](https://github.com/scrawlon/Get-Someecards-Meme-Links) project -- See the [example json file](https://scrawlon.com/Get-Someecards-Meme-Links/ecard-links.json) for more info.
3. Iterates array of ecard URLs and scrapes ecard embed codes from Someecards, using Puppeteer.
4. Outputs JSON file to './dist' folder.

Example calendar outputfile: [https://scrawlon.com/Create-Someecards-Calendar/calendar-ecards-2020.json](https://scrawlon.com/Create-Someecards-Calendar/calendar-ecards-2020.json)

## Installation
Clone the repo and install dependencies:
```
git clone git@github.com:scrawlon/Create-Someecards-Calendar.git
```

```
cd Create-Someecards-Calendar
```

```
npm install
```

## How to use
To run, type:

```
npm run build
```