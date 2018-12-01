const {BehaviorSubject, from, of, timer, throwError} = require('rxjs');
const {map, distinct, filter, mergeMap, retry, catchError, finalize, share, retryWhen} = require('rxjs/operators');
const normalizeUrl = require('normalize-url');
const rp = require('request-promise-native');
const {resolve} = require('url');
const cheerio = require('cheerio');
const fs = require('fs');

// key web scraping properties
const baseUrl = 'https://imdb.com';
const maxConcurrentReq = 10;
const maxRetries = 5;

const genericRetryStrategy = ({
                                  maxRetryAttempts,
                                  scalingDuration,
                                  excludedStatusCodes
                              }) => attempts => {
    return attempts.pipe(
        mergeMap((error, i) => {
            const retryAttempt = i + 1;
            // if maximum number of retries have been met
            // or response is a status code we don't wish to retry, throw error
            if (
                retryAttempt > maxRetryAttempts ||
                excludedStatusCodes.find(e => e === error.status)
            ) {
                return throwError(error);
            }
            console.log(
                `Attempt ${retryAttempt}: retrying in ${retryAttempt *
                scalingDuration}ms`
            );
            // retry after 1s, 2s, etc...
            return timer(retryAttempt * scalingDuration);
        }),
        finalize(() => console.log('We are done!'))
    );
};


// starting point for all crawling operations
const allUrl$ = new BehaviorSubject(baseUrl);

// scrape each URL only once
const uniqueUrl$ = allUrl$.pipe(
    // just crawl IMDB url
    filter(url => url.includes(baseUrl)),
    // normalise url for comparison
    map(url => normalizeUrl(url, {removeQueryParameters: ['ref', 'ref_']})),
        // filter out duplicate values
    distinct()
);

// make request to each URL and map content into an observable

const urlAndDOM$ = uniqueUrl$.pipe(
    mergeMap(
        url => {
            return from(rp(url)).pipe(
                retryWhen(
                    genericRetryStrategy({
                        maxRetryAttempts: maxRetries,
                        scalingDuration: 3000,
                        excludedStatusCodes: []
                    })
                ),
                catchError(error => {
                    const { uri } = error.options;
                    console.log(`Error requesting ${uri} after ${maxRetries} retries.`);
                    // return null on error
                    return of(null);
                }),
                // filter out errors
                filter(v => v),
                // get the cheerio function $
                map(html => cheerio.load(html)),
                // add URL to the result. It will be used later for crawling
                map($ => ({
                    $,
                    url
                }))
            );
        },
        null,
        maxConcurrentReq
    ),
    share()
);

// crawl all links inside the base URL and send them to allUrl$ to be crawled
// get all crawable URLs
urlAndDOM$.subscribe(({ url, $ }) => {
    $('a').each(function(i, elem) {
        const href = $(this).attr('href');
        if (!href) return;

        // build the absolute url
        const absoluteUrl = resolve(url, href);
        allUrl$.next(absoluteUrl);
    });
});

// scrape for a movie with passed in criteria - customise ratings here

const isMovie = $ =>
    $(`[property='og:type']`).attr('content') === 'video.movie';
const isDrama = $ =>
    $(`.title_wrapper .subtext`)
        .text()
        .includes('Drama');
const isHighlyRated = $ => +$(`[itemprop="ratingValue"]`).text() > 7.5;
urlAndDOM$
    .pipe(
        filter(({ $ }) => isMovie($)),
        filter(({ $ }) => isDrama($)),
        filter(({ $ }) => isHighlyRated($))
    )
    .subscribe(({ url, $ }) => {
        // append the data we want to a file named "comedy.txt"
        fs.appendFile('drama.txt', `${url}, ${$('title').text()}\n`, () => {
            console.log(`appended ${url}`);
        });
    });
