const fs = require('fs');

const puppeteer = require('puppeteer');
const fetch = require('node-fetch');

const cliArgs = process.argv.slice(2);

const baseUrl = 'https://www.someecards.com/';
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
        dateObjects: []
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
        const season = getSeason(month);
        const useWeekendCategory = weekendCategories.length && [5].includes(day); // 5 is Friday. 0 is Sunday. 6 is Saturday
        const holidayUrls = getHolidayUrls(eventsByMonth[month], timestamp);
        const categoryUrl = useWeekendCategory ? getCategoryUrl(weekendCategories) : getCategoryUrl(categories, season);

        /* TODO: deal with Seasonal category */

        calendarObject.dateObjects.push({
            date,
            day,
            holidayUrls,
            categoryUrl
        });
    }

    if ( ! calendarObject.dateObjects.length ) {
        process.exit(1);
    }

    fs.writeFileSync(`./calendar-object-${calendarYear}.json`, JSON.stringify(calendarObject));

    return Promise.resolve(calendarObject);
}

function createCalendar(year) {
    const firstDayOfYear = new Date(year, 0, 1).setUTCHours(4,0,0,0);
    let currentDate = new Date(firstDayOfYear);
    let calendar = [];
    let dayCount = 0;
    let lastDate = 0;

    while ( currentDate.getUTCFullYear() < year + 1 ) {
        currentDate = new Date(firstDayOfYear);
        currentDate.setDate(currentDate.getDate() + dayCount);
        currentDate.setUTCHours(0,0,0,0);

        if ( currentDate.getTime() > lastDate && currentDate.getUTCFullYear() === year ) {
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

function getCategoryUrl(categories, stringMatch = '') {
    const categoryTypes = Object.keys(categories);
    const stringMatchCategories = ['seasonal'];
    const randomCategory = getRandomArrayItem(categoryTypes); 
    const randomUrl = stringMatch && stringMatchCategories.includes(randomCategory)
        ? getRandomArrayItem(categories[randomCategory], stringMatch)
        : getRandomArrayItem(categories[randomCategory]); 

    return getUniqueUrl(randomUrl, getCategoryUrl, categories, stringMatch);
}

function getSeason(month) {
    const seasons = {
        'spring': [3, 4, 5],
        'summer': [6, 7, 8], 
        'fall': [9, 10, 11], 
        'winter': [12, 1, 2] 
    }

    for ( const [season, months] of Object.entries(seasons) ) {
        if ( months.includes(month) ) {
            return season;
        }
    }

    return false;
}

function getRandomArrayItem(items, stringMatch = '') {
    const randomItem = items && items[Math.floor(Math.random() * items.length)];
    const isStringMatch = randomItem && randomItem.includes(stringMatch);

    if ( ( stringMatch && isStringMatch ) || ( ! stringMatch && randomItem ) ) {
        return randomItem; 
    }

    return '';
}

function getUniqueUrl(url, callback, categories, stringMatch) {
    if ( ! url || usedUrls.includes(url) ) {
        url = callback(categories, stringMatch);
    } else {
        usedUrls.push(url);
    }

    return url;
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

function getUniqueRandomUrl(urls) {
    const randomUrl = getRandomArrayItem(urls);

    return getUniqueUrl(randomUrl, getUniqueRandomUrl, urls);
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
    const calendarYear = cliYear ?  cliYear : new Date().getUTCFullYear();

    let calendarEcards = {};
    try {
        calendarEcards = require(`./dist/calendar-ecards-${calendarYear}.json`); 
        console.log(`${calendarYear} calendar ecards calendar already exists in './dist/calendar-ecards-${calendarYear}.json'`);

        process.exit(1);
    } catch {
        console.log(`Creating new ${calendarYear} calendar ecards calendar file in './dist/calendar-ecards-${calendarYear}.json'`);
    }

    let calendarObject = {};
    try {
        calendarObject = require(`./calendar-object-${calendarYear}.json`); 
        console.log(`${calendarYear} calendar object file found in './calendar-object-${calendarYear}.json'`);

        /* DEBUG: view full calendarObject */
        // const util = require('util');
        // console.log(util.inspect(calendarObject, false, null, true));
        // process.exit(1);
    } catch {
        calendarObject = await getCalendarObject(calendarYear);
        console.log(`Creating new ${calendarYear} calendar object file in './calendar-object-${calendarYear}.json'`);
    }
    const { birthdayUrl, anniversaryUrl, dateObjects } = calendarObject;

    calendarObject.birthdayCard = await getEcardObject( browser, page, birthdayUrl ); 
    calendarObject.anniversaryCard = await getEcardObject( browser, page, anniversaryUrl ); 

    for ( let [i, dateObject] of dateObjects.entries() ) {
        const { date, day, holidayUrls, categoryUrl } = dateObject;

        calendarObject.dateObjects[i].categoryCard = await getEcardObject( browser, page, categoryUrl ); 

        for ( let [j, holidayUrlObject] of holidayUrls.entries() ) {
            const { holidayUrl } = holidayUrlObject;
            calendarObject.dateObjects[i].holidayUrls[j].holidayCard = await getEcardObject( browser, page, holidayUrl ); 
        }
    }

    async function getEcardObject( browser, page, url ) {
        let ecard = {};

        /* Load Someecard categories from window.__APP_STATE__ JavaScript variable */ 
        await page.goto(`${baseUrl}${url}`);
        const seAppState = await page.evaluate(() => window.__APP_STATE__);
        const { cards } = seAppState;

        for ( const [slug, card] of Object.entries(cards) ) {
            if ( url.includes(slug) ) {
                ecard = cards[slug];
            }
        }

        console.log(ecard);

        return Promise.resolve(ecard);
    }

    if ( ! fs.existsSync('./dist') ) {
        fs.mkdirSync('./dist');
    }

    fs.writeFileSync(`./dist/calendar-ecards-${calendarYear}.json`, JSON.stringify(calendarObject));
    
    await browser.close();
})();