const {BehaviorSubject} = require('rxjs');
const baseUrl = 'https://imdb.com';

// starting point for all crawling operations
const allUrl$ = new BehaviorSubject(baseUrl);

const {map, distinct, filter} = require('rxjs/operators');
const normalizeUrl = require('normalize-url');

const uniqleUrl$ = allUrl$.pipe(
    // just crawl IMDB url
    filter(url => url.includes(baseUrl)),
    // normalise url for comparison
    map(url => normalizeUrl(url, {removeQueryParameters: ['ref', 'ref_']})),
        // filter out duplicate values
    distinct()
);
