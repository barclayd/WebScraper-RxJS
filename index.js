const {BehaviorSubject, from} = require('rxjs');
const {map, distinct, filter, mergeMap} = require('rxjs/operators');
const normalizeUrl = require('normalize-url');
const rp = require('request-promise-native');
const {resolve} = require('url');
const cheerio = require('cheerio');

const baseUrl = 'https://imdb.com';

// starting point for all crawling operations
const allUrl$ = new BehaviorSubject(baseUrl);

// scrape each URL only once
const uniqleUrl$ = allUrl$.pipe(
    // just crawl IMDB url
    filter(url => url.includes(baseUrl)),
    // normalise url for comparison
    map(url => normalizeUrl(url, {removeQueryParameters: ['ref', 'ref_']})),
        // filter out duplicate values
    distinct()
);

// make request to each URL and map content into an observable

const urlAndDOM$ = uniqleUrl$.pipe(
    mergeMap(url => {
        return from(rp(url)).pipe(
            map(html => cheerio.load(html)),
            // add URL to the result
            map($ => ({
                $,
                url
            }))
        );
    })
);

// crawl all links inside the base URL and send them to allUrl$ to be crawled
// get all crawable URLs
urlAndDOM$.subscribe(({ url, $}) => {
    $('a').each(function(i, elem) {
        const href = $(this).attr('href');
        if(!href) return;

        // build absolute url
        const absoluteUrl = resolve(url, href);
        allUrl$.next(absoluteUrl);
    });
});
