const fs = require('fs');

const puppeteer = require('puppeteer');
const fetch = require('node-fetch');

const cliArgs = process.argv.slice(2);

const defaults = {
    someecardsLinksUrl: 'https://scrawlon.com/Get-Someecards-Meme-Links/ecard-links.json'
};

let config = {};
try {
	config = require('./config.json');
	console.log(`Config file found. Running with selected options.`);
} catch {
	console.log(`Config file not found. Running with default options.`);
}

const someecardsLinksUrl = config.someecardsLinksUrl ? config.someecardsLinksUrl : defaults.someecardsLinksUrl; 

let localSomeecardsLinksJson = {};
try {
    localSomeecardsLinksJson = require('./ecard-links.json');
    console.log(`Loading local ecard-links.json`);
} catch {
    localSomeecardsLinksJson = getSomeecardLinksJson(someecardsLinksUrl)
    console.log(`Loading remote json file ${someecardsLinksUrl}`);
}

/* Keep list of URLs as they're used, in order to avoid duplicates */
let usedUrls = [];

async function getSomeecardLinksJson(url) {
    const someecardsLinks = await fetch(someecardsLinksUrl);

    return await someecardsLinks.json(); 
}

async function getCalendarObject(calendarYear) {
    const someecardsLinks = await fetch(someecardsLinksUrl);
    const someecardsLinksJson = Object.keys(localSomeecardsLinksJson).length
        ? localSomeecardsLinksJson 
        : await someecardsLinks.json(); 
    const { baseUrl, categories, eventsByMonth } = someecardsLinksJson;
    const calendar = createCalendar(calendarYear);
    const calendarObject = {
        birthdayUrl: '',
        anniversaryUrl: '',
        calendarUrls: []
    };

    /* Collect specialty categories */
    const weekendCategories = getSpecificCategoryUrls(categories, 'weekend');
    const birthdayCategories = getSpecificCategoryUrls(categories, 'birthday');
    const anniversaryCategories = getSpecificCategoryUrls(categories, 'anniversary');

    delete categories['weekend'];
    delete categories['birthday'];
    delete categories['anniversary'];

    calendarObject.birthdayUrl = getCategoryUrl(birthdayCategories);
    calendarObject.anniversaryUrl = getCategoryUrl(anniversaryCategories);

    /* Load config.json options */
    const { specialHolidayEvents } = config;

    for ( let specialHolidayEvent of specialHolidayEvents ) {
        const { startDate, endDate, slug } = specialHolidayEvent;
        const startDateString = `${calendarYear}-${startDate}`;
        const endDateString = `${calendarYear}-${endDate}`;
        const holidayMonth = new Date(startDateString).getMonth() + 1;
        const holidayMonthCategoryUrls = categories && categories[slug] ? categories[slug] : [];

        if ( holidayMonthCategoryUrls.length ) {
            specialHolidayEvent.urls = holidayMonthCategoryUrls;
            specialHolidayEvent.startDate = startDateString;
            specialHolidayEvent.endDate = endDateString;

            eventsByMonth[holidayMonth]['events'].push(specialHolidayEvent);
            delete categories[slug];
        }
    }

    for ( let dateString of calendar ) {
        const date = new Date(dateString);
        const timestamp = date.setUTCHours(0,0,0,0); 
        const month = date.getMonth() + 1;
        const day = date.getDay();
        const useWeekendCategory = weekendCategories.length && [5].includes(day); // 5 is Friday. 0 is Sunday. 6 is Saturday
        const holidayUrls = getHolidayUrls(eventsByMonth[month], timestamp);
        const categoryUrl = useWeekendCategory ? getCategoryUrl(weekendCategories) : getCategoryUrl(categories);

        /* TODO: deal with Seasonal category */

        // console.log({holidayUrls});
        // console.log({categoryUrl});
        // console.log({date, isWeekend});

        calendarObject.calendarUrls.push({
            date,
            day,
            holidayUrls,
            categoryUrl
        });
    }

    if ( ! calendarObject.calendarUrls.length ) {
        process.exit(1);
    }

    return Promise.resolve(calendarObject);
}

function createCalendar(year) {
    const firstDayOfYear = new Date(year, 0, 1).setUTCHours(4,0,0,0);
    let lastDayOfYear = new Date(year, 11, 31).setUTCHours(4,0,0,0);
    let currentDate = new Date(firstDayOfYear);
    let calendar = [];
    let dayCount = 0;
    let lastDate = 0;

    lastDayOfYear = new Date(lastDayOfYear);
    lastDayOfYear.setDate(lastDayOfYear.getDate());

    while ( currentDate.getTime() < lastDayOfYear.getTime() ) {
        currentDate = new Date(firstDayOfYear);
        currentDate.setDate(currentDate.getDate() + dayCount);
        currentDate.setUTCHours(0,0,0,0);

        if ( currentDate.getTime() !== lastDate ) {
            calendar.push(currentDate);
            lastDate = currentDate.getTime();
        }
        dayCount++;
    }

    // console.log({calendar});
    return calendar;
}

function getSpecificCategoryUrls( categories, categoryName ) {
    const specificCategoryUrls = categories[categoryName] !== 'undefined'
        ? categories[categoryName]
        : [];
    return {
        categoryName: specificCategoryUrls
    };
}

function getCategoryUrl(categories) {
    const categoryTypes = Object.keys(categories);
    const randomCategory = getRandomArrayItem(categoryTypes); 
    const randomUrl = getRandomArrayItem(categories[randomCategory]);

    return getUniqueUrl(randomUrl, getCategoryUrl, categories);
}

function getHolidayUrls(eventsByCurrentMonth, currentDate) {
    const { month_name: monthName, events } = eventsByCurrentMonth; 
    let holidayUrls = [];

    for ( let event of events ) {
        const { startDate: startDateString, endDate: endDateString, name, slug, urls } = event;
        const startDate = new Date(startDateString).setUTCHours(0,0,0,0);
        const endDate = new Date(endDateString).setUTCHours(0,0,0,0);
        let holidayUrl;

        /* Only match first occurence of a holiday */
        if ( currentDate === startDate ) {
            holidayUrl = getUniqueRandomUrl(urls);
            holidayUrls.push({
                name,
                holidayUrl
            });
            // console.log({currentDate, startDateString, holidayUrl});
        }
    }

    return holidayUrls;
}

function getUniqueRandomUrl(urls, count = 2) {
    const randomUrl = getRandomArrayItem(urls);

    return getUniqueUrl(randomUrl, getUniqueRandomUrl, urls);
}

function getRandomArrayItem(items) {
    return items[Math.floor(Math.random() * items.length)]; 
}

function getUniqueUrl(url, callback, callbackParam) {
    if ( usedUrls.includes(url) ) {
        url = callback(callbackParam);
    } else {
        usedUrls.push(url);
    }

    return url;
}

async function ignoreVisualElements(page) {
    await page.setRequestInterception(true);
    page.on('request', (req) => {
		const visualElements = ['image', 'stylesheet', 'font'];

		if ( visualElements.includes(req.resourceType()) ) {
			req.abort();
        } else {
            req.continue();
        }
	});

	return Promise.resolve();
}

(async () => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();

	/* Improve script speed by not loading visual resources */
    await ignoreVisualElements(page);

    const cliYear = cliArgs[0] !== 'undefined' && parseInt(cliArgs[0]) > 2000 && parseInt(cliArgs[0]) < 2050 
        ? parseInt(cliArgs[0]) : 0;
    const calendarYear = cliYear ?  cliYear : new Date().getFullYear();
    const calendarObject = await getCalendarObject(calendarYear);
    const { birthdayUrl, anniversaryUrl, calendarUrls } = calendarObject;

    for ( let calendarUrl of calendarUrls ) {
        const { date, day, holidayUrls, categoryUrl } = calendarUrl;
        console.log({holidayUrls});
    }

    /* DEBUG: view full calendarObject */
    const util = require('util');
    // console.log(util.inspect(calendarObject, false, null, true));
    
    await browser.close();
})()