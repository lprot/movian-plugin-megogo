/**
 * MEGOGO plugin for Movian Media Center
 *
 *  Copyright (C) 2015-2018 lprot
 *
 *  This program is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU General Public License as published by
 *  the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 *
 *  This program is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU General Public License for more details.
 *
 *  You should have received a copy of the GNU General Public License
 *  along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

var page = require('showtime/page');
var service = require('showtime/service');
var settings = require('showtime/settings');
var http = require('showtime/http');
var string = require('native/string');
var popup = require('native/popup');
var plugin = JSON.parse(Plugin.manifest);
var logo = Plugin.path + plugin.icon;

var BASE_URL = 'http://megogo.net',
    API = 'https://api.megogo.net/v1';
var logged = false,
    credentials, k1 = '_android_j7', k2 = 'a0486cf845',
    UA = 'Dalvik/2.1.0 (Linux; U; Android 7.0)'
var users, config = false, digest;

function trim(s) {
    return s.replace(/(\r\n|\n|\r)/gm, "").replace(/(^\s*)|(\s*$)/gi, "").replace(/[ ]{2,}/gi, " ").replace(/\t/g, '');
}

var blue = '6699CC',
    orange = 'FFA500',
    red = 'EE0000',
    green = '008B45';

function colorStr(str, color) {
    return '<font color="' + color + '"> (' + str + ')</font>';
}

function coloredStr(str, color) {
    return '<font color="' + color + '">' + str + '</font>';
}

function setPageHeader(page, title) {
    if (page.metadata) {
        page.metadata.title = title;
        page.metadata.logo = logo;
    }
    page.type = "directory";
    page.contents = "items";
    page.loading = false;
    if (!config) loginAndGetConfig(page, false);
}

RichText = function(x) {
    this.str = x.toString();
}

RichText.prototype.toRichString = function(x) {
    return this.str;
}

function cryptodigest(algo, str) {
    var crypto = require('native/crypto');
    var hash = crypto.hashCreate(algo);
    crypto.hashUpdate(hash, str);
    return Duktape.enc('hex', crypto.hashFinalize(hash));
}

function getJSON(page, url, params) {
    page.loading = true;
    if (!params) params = '';
    var numOfTries = 0;
    while (numOfTries < 10) {
        var requestUrl = API + url + encodeURI(params) + (url.match(/\?/) ? '&sign=' : '?sign=') + cryptodigest('md5', params.replace(/\&/g, '') + k2) + k1;
        //print(requestUrl);
        var json = JSON.parse(http.request(requestUrl, {
            headers: {
                'User-Agent': UA
            }
        }));
        //print(JSON.stringify(json));
        if (json.result == 'ok') break;
        numOfTries++;
    }
    page.loading = false;
    return json;
}

function loginAndGetConfig(page, showDialog) {
    var text = '';
    if (showDialog) {
        text = 'Введите email и пароль';
        config = users = logged = false;
    }

    if (!logged) {
        credentials = popup.getAuthCredentials(plugin.synopsis, text, showDialog);
        if (credentials && credentials.username && credentials.password) {
            var params = 'login=' + credentials.username + '&password=' + credentials.password;
            page.loading = true;
            var json = JSON.parse(http.request(API + '/auth/login/any?', {
                headers: {
                    'User-Agent': UA
                },
                postdata: {
                    'login': credentials.username,
                    'password': credentials.password,
                    'sign': cryptodigest('md5', params.replace(/\&/g, '') + k2) + k1
                }
            }));
            page.loading = false;
            if (json && json.result == 'ok') logged = true;
        }
    }

    if (showDialog) {
        if (logged) popup.message("Вход успешно произведен. Параметры входа сохранены.", true, false);
        else popup.message("Не удалось войти. Проверьте email/пароль...", true, false);
    }

    if (logged && !users) users = getJSON(page, '/user');
    if (!config) config = getJSON(page, '/configuration');
    if (showDialog) {
        page.flush();
        page.redirect(plugin.id + ':start');
    }
}

function appendVideosToPage(page, json, counter, separator) {
    var route = ':indexByID:';
    if (separator == 'Подборки:') route = ':collection:'; 

    for (var i in json) {
        if (!service.showPaidContent && getReason(json[i])) 
            continue;
        if (separator) {
            page.appendItem("", "separator", {
                title: separator
            });
            separator = false;
        }
        appendItem(page, json[i], plugin.id + route + json[i].id + ':' + escape(json[i].title),
            json[i].title + (json[i].is_series ? colorStr('сериал', orange) : '')
        );
        counter++;
        page.entries++;
    };
    return counter;
};

function getGenre(category, genre_list) {
    var genres = '';
    for (var i in config.data.categories) {
        if (config.data.categories[i].id == category[0]) {
            for (var j in genre_list) {
                for (var k in config.data.genres) {
                    if (genre_list[j] == config.data.genres[k].id) {
                        if (!genres)
                            genres = config.data.genres[k].title;
                        else
                            genres += ', ' + config.data.genres[k].title;
                    }
                }
            }
            break;
        }
    }
    return genres;
}

function getReason(json) { 
    if (json.delivery_rules) {
        switch (json.delivery_rules[0]) {
            case 'svod':
                return coloredStr('+', orange);
            case 'tvod','dto':
                return coloredStr('$', orange);
            default:
                return '';
        }
    }
    return '';
}

function appendItem(page, json, route, title) {
    var genres = json.categories ? getGenre(json.categories, json.genres) : '';
    var item = page.appendItem(route, "video", {
        title: new RichText(getReason(json) + title),
        year: +parseInt(json.year),
        genre: genres,
        icon: json.image.image_original ? json.image.image_original : json.image.small,
        rating: json.rating_kinopoisk ? json.rating_kinopoisk * 10 : null,
        duration: json.duration ? +parseInt(json.duration) : null,
        description: new RichText(
            (json.is_exclusive ? coloredStr('Эксклюзивно на megogo!', red) + '<br>' : '') +
            (json.availableReason == 'tvod' && json.purchase_info ? coloredStr('Стоимость фильма: ', orange) + json.purchase_info.tvod.subscriptions[0].tariffs[0].price + ' ' + json.purchase_info.tvod.subscriptions[0].currency + '<br>' : '') +
            (json.vote ? coloredStr('Вы голосовали за этот фильм: ', orange) + (json.vote ? 'Нравится' : 'Не нравится') + '<br>' : '') +
            (json.isFavorite ? coloredStr('Фильм находится в Избранном', orange) + '<br>' : '') +
            (json.like ? coloredStr('Лайков: ', orange) + coloredStr(json.like, green) + coloredStr(' Дизлайков: ', orange) + coloredStr(json.dislike, red) : '') +
            (json.comments_num ? coloredStr(' Комментариев: ', orange) + unescape(json.comments_num) : '') +
            (json.country ? coloredStr('<br>Страна: ', orange) + unescape(json.country) : '') +
            (json.video_total ? coloredStr('<br>К-во видео: ', orange) + unescape(json.video_total) : '') +
            (json.description ? coloredStr('<br>Описание: ', orange) +
                trim(string.entityDecode(unescape(json.description.replace(/&#151;/g, '—')))) : ''))
    });
    item.id = json.id;
    item.vote = json.vote;
    item.isFavorite = json.isFavorite;

    // Voting
    item.onEvent('vote', function(item) {
        if (+this.vote < 1) {
            getJSON(page, '/videos/addvote?', 'video_id=' + this.id + '&like=1');
            //this.vote = 1;
            popup.notify("Ваш голос (нравится) '" + title + "' добавлен.", 2);
        } else {
            getJSON(page, '/videos/addvote?', 'video_id=' + this.id + '&like=-1');
            //this.vote = -1;
            popup.notify("Ваш голос (не нравится) '" + title + "' добавлен.", 2);
        }
    });
    if (+item.vote < 1) item.addOptAction("Голосовать (нравится) за '" + title.replace(/<[^>]*>/g, '') + "'", 'vote');
    if (+item.vote > -1) item.addOptAction("Голосовать (не нравится) за '" + title.replace(/<[^>]*>/g, '') + "'", 'vote');

    // Favorite
    item.onEvent('addFavorite', function(item) {
        if (this.isFavorite == false) {
            getJSON(page, '/favorites/add?', 'video_id=' + this.id);
            popup.notify("'" + title.replace(/<[^>]*>/g, '') + "' добавлен в 'Избранное'", 2);
            //this.isFavorite = true;
        } else {
            getJSON(page, '/favorites/remove?', 'video_id=' + this.id);
            popup.notify("'" + title.replace(/<[^>]*>/g, '') + "' удален из 'Избранное'", 2);
            //this.isFavorite = false;
        }
    });
    if (item.isFavorite == false) item.addOptAction("Добавить '" + title.replace(/<[^>]*>/g, '') + "' в 'Избранное'", 'addFavorite');
    else item.addOptAction("Удалить '" + title.replace(/<[^>]*>/g, '') + "' из 'Избранное'", 'addFavorite');
    // Comment
    item.onEvent('addComment', function(item) {
        var text = popup.textDialog('Введите комментарий: ', true, true);
        if (!text.rejected && text.input) {
            page.loading = true;
            var params = 'video_id=' + this.id + 'text=' + text.input;
            var json = JSON.parse(http.request(API + '/comments/add?sign=' + cryptodigest('md5', params.replace(/\&/g, '') + k2) + k1, {
                postdata: {
                    'video_id': this.id,
                    'text': text.input
                }
            }));
            page.loading = false;
            popup.notify("Комментарий добавлен.", 2);
        }
    });
    item.addOptAction("Добавить комментарий к '" + title.replace(/<[^>]*>/g, ''), 'addComment');
}

function processVideoItem(page, json, json2, genres) {
    if (json2) { // season
        for (var i in json2) {
            appendItem(page, json.data, plugin.id + ':season:' + json2[i].id + ':' +
                escape(json.data.title + String.fromCharCode(8194) + '- ' + json2[i].title +
                    (json2[i].title_orig ? ' | ' + json2[i].title_orig : '')) + ':' + i,
                json2[i].title + (json2[i].title_orig ? ' | ' +
                    json2[i].title_orig : '') + ' (' + json2[i].total + ' серий)'
            );
        }
    } else {
        appendItem(page, json.data, plugin.id + ':video:' + json.data.id + ':' +
            escape(json.data.title + (json.data.title_orig ? ' | ' +
                json.data.title_orig : '')),
            json.data.title + (json.data.title_orig ? ' | ' +
                json.data.title_orig : '')
        );
    }
}

service.create(plugin.title, plugin.id + ":start", 'video', true, logo);

function getGenreTitle(genre) {
    for (var k in config.data.genres) 
        if (genre == config.data.genres[k].id) 
            return config.data.genres[k].title;
    return 'unknown';
}

new page.Route(plugin.id + ":channel:(.*):(.*)", function(page, id, title) {
    setPageHeader(page, unescape(title));
    //var json = getJSON(page, '/tv/channels?', '&offset=0&limit=200');
    var json = getJSON(page, '/epg?', '&external_id=' + id);
    for (var i in json.data[0].programs) 
        page.appendItem(plugin.id + ':indexByID:' + json.data[0].programs[i].object_id + ':' + escape(json.data[0].programs[i].title), 'file', {
            title: new RichText(json.data[0].programs[i].title + coloredStr(' (' + json.data[0].programs[i].start + ' - ' + json.data[0].programs[i].end + ')', orange))
        });
});

new page.Route(plugin.id + ":package:(.*):(.*)", function(page, id, title) {
    setPageHeader(page, unescape(title));
    var json = getJSON(page, '/tv?', '');
    var counter = 0;
    for (var i in json.data.packages) {
        if (json.data.packages[i].id == id) {
            for (var j in json.data.packages[i].channels) {
                if (json.data.packages[i].channels[j].title.match(/[M]/)) {
                    page.appendItem(plugin.id + ':channel:' + json.data.packages[i].channels[j].id + ':' + escape(json.data.packages[i].title), 'video', {
                        title: new RichText(json.data.packages[i].channels[j].title),// + coloredStr(' (' + json.data.packages[i].channels_num + ')', orange))
                        icon:json.data.packages[i].channels[j].image.original
                    });
                    counter++;
                } else {
                    page.appendItem(plugin.id + ':video:' + json.data.packages[i].channels[j].id + ':' + escape(json.data.packages[i].title), 'video', {
                        title: new RichText(json.data.packages[i].channels[j].title),// + coloredStr(' (' + json.data.packages[i].channels_num + ')', orange))
                        icon:json.data.packages[i].channels[j].image.original
                    });
                  counter++;
                }
            }
            break;
        }
    }
    page.metadata.title += ' (' + counter + ')'
});

// Shows genres of the category
new page.Route(plugin.id + ":genres:(.*):(.*)", function(page, id, title) {
    if (id == 23) {
        setPageHeader(page, 'ТВ подписки');
        var json = getJSON(page, '/tv?', '');
        for (var i in json.data.packages) {
            page.appendItem(plugin.id + ':package:' + json.data.packages[i].id + ':' + escape(json.data.packages[i].title), 'video', {
                title: new RichText((json.data.packages[i].bought ? '' : coloredStr('$', orange)) + json.data.packages[i].title + coloredStr(' (' + json.data.packages[i].channels_num + ')', orange)),
                description: json.data.packages[i].description_full + '. ' + json.data.packages[i].promo_phrase
            });
        }
        return;
    }
    setPageHeader(page, unescape(title));

    for (var i in config.data.categories) {
        if (config.data.categories[i].id == id) {
            for (var j in config.data.categories[i].genres) {
                page.appendItem(plugin.id + ':videos:' + id + ':' + config.data.categories[i].genres[j] + ':' + escape(getGenreTitle(config.data.categories[i].genres[j])), 'directory', {
                    title: getGenreTitle(config.data.categories[i].genres[j]),
                    icon: logo
                });
            }
            break;
        }
    }
    var offset = 0,
        limit = 20,
        counter = 0,
        tryToSearch = true;

    function loader() {
        if (!tryToSearch) return false;
        var json = getJSON(page, '/video?', 'category_id=' + id + '&limit=' + limit + '&offset=' + offset);
        page.metadata.title = unescape(title + ' (' + json.data.total + ')');
        counter = appendVideosToPage(page, json.data.video_list, counter);
        offset += limit;
        if (counter == +json.data.total || offset > +json.data.total) return tryToSearch = false;
        return true;
    };
    loader();
    page.loading = false;
    page.paginator = loader;
});

// Shows videos of the genre
new page.Route(plugin.id + ":videos:(.*):(.*):(.*)", function(page, category_id, genre_id, title) {
    setPageHeader(page, unescape(title));
    var offset = 0,
        limit = 20,
        counter = 0,
        tryToSearch = true;

    function loader() {
        if (!tryToSearch) return false;
        var json = getJSON(page, '/video?', 'category_id=' + category_id + '&limit=' + limit + '&offset=' + offset + '&genre=' + genre_id);
        counter = appendVideosToPage(page, json.data.video_list, counter);
        offset += limit;
        page.metadata.title = unescape(title + ' (' + json.data.total + ')');
        if (counter == +json.data.total || offset > +json.data.total) return tryToSearch = false;
        return true;
    };
    loader();
    page.loading = false;
    page.paginator = loader;
});

// Shows screenshots
new page.Route(plugin.id + ":screenshots:(.*):(.*)", function(page, title, id) {
    setPageHeader(page, unescape(title));
    page.model.contents = 'grid';
    var json = getJSON(page, '/video/info?', 'id=' + id);
    var counter = 1;
    for (var i in json.data.screenshots) {
        page.appendItem(json.data.screenshots[i].big, "image", {
            title: 'Фото' + counter,
            icon: json.data.screenshots[i].small
        });
        counter++;
    }
});

// Shows people info
new page.Route(plugin.id + ":people:(.*):(.*)", function(page, id, title) {
    setPageHeader(page, unescape(title));
    var json = getJSON(page, '/people?', 'id=' + id);
    page.appendPassiveItem('video', '', {
        title: new RichText(json.data.name + (trim(json.data.name_original) ? ' | ' + trim(json.data.name_original) : '')),
        icon: json.data.avatar.image_original,
        description: new RichText(trim(json.data.description))
    });
    appendVideosToPage(page, json.data.filmography, 0, 'Фильмография:');
});

// This route should be kept for legacy purposes
new page.Route(plugin.id + ':directory:(.*):(.*)', function(page, id, title) {
    page.redirect(plugin.id + ':indexByID:' + id + ':' + title);
});

// Shows video page
new page.Route(plugin.id + ':indexByID:(.*):(.*)', function(page, id, title) {
    setPageHeader(page, unescape(title));
    var json = getJSON(page, '/video/info?', 'id=' + id + '&root_object=1');
    if (json.result == 'error') {
        page.error('Извините, видео не доступно / Sorry, video is not available :(');
        return;
    }
    if (json.data.title_original) 
        page.metadata.title += ' / ' + json.data.title_original;
    var genres = getGenre(json.data.categories, json.data.genres);
    if (json.data.is_series)
        processVideoItem(page, json, json.data.season_list, genres);
    else
        processVideoItem(page, json, 0, genres);

    // Screenshots
    if (json.data.screenshots[0]) {
        page.appendItem(plugin.id + ':screenshots:' + escape(json.data.title + (json.data.title_orig ? ' | ' + json.data.title_orig : '')) + ':' + id, 'directory', {
            title: 'Фото'
        });
    }

    // Show peoples
    var first = true;
    if (json.data.people) {
        var prevType = '';
        for (var i in json.data.people) {
            for (var j in config.data.member_types) {
                if (json.data.people[i].type == config.data.member_types[j].type) {
                    if (prevType != json.data.people[i].type) {
                        //page.appendItem("", "separator", {
                        //    title: unescape(config.data.member_types[j].title)
                        //});
                        prevType = config.data.member_types[j].type;
                    }
                    break;
                }
            }
            if (first) {
                page.appendItem("", "separator", {
                    title: 'Над видео работали:'
                });
                first = false;
            }
            page.appendItem(plugin.id + ':people:' + json.data.people[i].id + ':' + escape(json.data.people[i].name + (trim(json.data.people[i].name_original) ? ' | ' + trim(json.data.people[i].name_original) : '')), 'video', {
                title: new RichText(json.data.people[i].name + (trim(json.data.people[i].name_original) ? ' | ' + trim(json.data.people[i].name_original) : '') + ' ' + colorStr(config.data.member_types[j].title, orange)),
                icon: json.data.people[i].avatar.image_360x360.replace(/13:/, '')
            });
        }
    }

    // Related videos
    appendVideosToPage(page, json.data.recommended_videos, 0, 'Что еще посмотреть?');

    // Comments
    var counter = 0;

    if (+json.data.comments_num) {
        if (!counter) {
            page.appendItem("", "separator", {
                title: 'Комментарии (' + json.data.comments_num + ')'
            });
        }

        var offset = counter, limit = 20, tryToSearch = true;

        function loader() {
            if (!tryToSearch) return false;
            page.loading = true;
            var json = getJSON(page, '/comment/list?', 'video_id=' + id + '&offset=' + offset + '&limit=' + limit);
            page.loading = false;
            for (var i in json.data.comments) {
                page.appendPassiveItem('video', '', {
                    title: new RichText(coloredStr(json.data.comments[i].user_name, orange) + ' (' +
                        json.data.comments[i].date.replace(/T/, ' ').replace(/Z/g, '') + ')' +
                        (json.data.comments[i].sub_comments_count ? ' ' + coloredStr(' комментариев ' + json.data.comments[i].sub_comments_count, orange) : '')),
                    icon: unescape(json.data.comments[i].user_avatar),
                    description: unescape(json.data.comments[i].text)
                });
                for (var j in json.data.comments[i].sub_comments) {
                    page.appendPassiveItem('video', '', {
                        title: new RichText(coloredStr(json.data.comments[i].sub_comments[j].user_name, orange) + ' (' +
                            json.data.comments[i].sub_comments[j].date.replace(/T/, ' ').replace(/Z/g, '') + ')' +
                            (json.data.comments[i].sub_comments[j].sub_comments_count ? ' ' + coloredStr(json.data.comments[i].sub_comments[j].sub_comments_count + ' комментарий(ев)', orange) : '')),
                        icon: unescape(json.data.comments[i].sub_comments[j].user_avatar),
                        description: unescape(json.data.comments[i].sub_comments[j].text)
                    });
                }
                counter++;
                if (counter == +json.data.total) break;
            };
            offset += limit;
            if (counter == +json.data.total || offset > +json.data.total) return tryToSearch = false;
            return true;
        }
        loader();
        page.loading = false;
        page.paginator = loader;
    }
    page.loading = false;
});

// Shows episodes of the season
new page.Route(plugin.id + ":season:(.*):(.*):(.*)", function(page, id, title, seasonNum) {
    setPageHeader(page, unescape(title));
    var json = getJSON(page, '/video/info?', 'id=' + id + '&root_object=1');
    for (var i = 0; i < json.data.season_list[seasonNum].total; i++) {
        page.appendItem(plugin.id + ':video:' + json.data.season_list[seasonNum].episode_list[i].id + ':' + escape(unescape(title) + ' - ' + json.data.season_list[seasonNum].episode_list[i].title), "video", {
            title: json.data.season_list[seasonNum].episode_list[i].title,
            icon: json.data.season_list[seasonNum].episode_list[i].image,
            duration: json.data.season_list[seasonNum].episode_list[i].duration
        });
    }
});

// Search IMDB ID by title
function getIMDBid(title) {
    var resp = http.request('http://www.imdb.com/find?ref_=nv_sr_fn&q=' + encodeURIComponent(string.entityDecode(unescape(title))).toString()).toString();
    var imdbid = resp.match(/<a href="\/title\/(tt\d+)\//);
    if (imdbid) return imdbid[1];
    return imdbid;
};

// Play video
new page.Route(plugin.id + ":video:(.*):(.*)", function(page, id, title) {
    var json = getJSON(page, '/stream?', 'video_id=' + id);

    if (!json.data.src) {
        popup.message("Не удается проиграть видео. Возможно видео доступно только по подписке, платное или не доступно для Вашего региона.", true, false);
        return;
    }
    setPageHeader(page, unescape(json.data.title));
    page.loading = true;
    var s1 = json.data.src.match(/(.*)\/a\/0\//);
    var s2 = json.data.src.match(/\/a\/0\/(.*)/);
    var season = null,
        episode = null;
    var series = unescape(title).split(String.fromCharCode(8194));
    var imdbTitle = series[0];
    if (series[1]) {
        series = series[1].split('-');
        season = +series[1].match(/(\d+)/)[1];
        episode = +series[2].match(/(\d+)/)[1];
    }
    var imdbid = getIMDBid(imdbTitle);

    function addSubtitles(videoparams) {
        for (var j in json.data.subtitles)  
            videoparams.subtitles.push({
                url: json.data.subtitles[j].url,
                language: json.data.subtitles[j].lang_original,
                source: plugin.title,
                title: json.data.subtitles[j].display_name
            });
        return videoparams
    };

    if (json.data.audio_tracks.length > 1) {
        for (var i in json.data.audio_tracks) {
            var videoparams = {
                title: unescape(json.data.title) + ' (' + string.entityDecode(unescape(json.data.audio_tracks[i].lang)) + (json.data.audio_tracks[i].lang_original ? '/' + string.entityDecode(unescape(json.data.audio_tracks[i].lang_original)) : '') + ')',
                canonicalUrl: plugin.id + ":video:" + id + ":" + title,
                imdbid: imdbid,
                season: season,
                episode: episode,
                sources: [{
                    url: "hls:" + (s1 ? s1[1] + "/a/" + json.data.audio_tracks[i].index + "/" + s2[1] : json.data.src)
                }],
                subtitles: []
            };
            videoparams = addSubtitles(videoparams);
            page.appendItem("videoparams:" + JSON.stringify(videoparams), "video", {
                title: unescape(json.data.title) + ' (' + string.entityDecode(unescape(json.data.audio_tracks[i].lang)) + (json.data.audio_tracks[i].lang_original ? '/' + string.entityDecode(unescape(json.data.audio_tracks[i].lang_original)) : '') + ')'
            });
        };
        page.loading = false;
        return;
    }
    page.type = "video";
    var videoparams = {
        title: unescape(json.data.title),
        canonicalUrl: plugin.id + ":video:" + id + ":" + title,
        imdbid: getIMDBid(title),
        season: season,
        episode: episode,
        sources: [{
            url: "hls:" + json.data.src
        }],
        subtitles: []
    };
    videoparams = addSubtitles(videoparams);
    page.source = "videoparams:" + JSON.stringify(videoparams);
    page.loading = false;
});

// Shows videos of the collection
new page.Route(plugin.id + ":collection:(.*):(.*)", function(page, id, title) {
    setPageHeader(page, unescape(title));
    var offset = 0,
        limit = 20,
        counter = 0,
        tryToSearch = true;

    function loader() {
        if (!tryToSearch) return false;
        var json = getJSON(page, '/video/collection?', 'id=' + id + '&offset=' + offset + '&limit=' + limit);
        counter = appendVideosToPage(page, json.data.video_list, counter);
        offset += limit;
        if (counter == +json.data.total || offset > +json.data.total) return tryToSearch = false;
        return true;
    };
    loader();
    page.loading = false;
    page.paginator = loader;
});

new page.Route(plugin.id + ":collections", function(page) {
    setPageHeader(page, 'Подборки');
    var offset = 0,
        limit = 20,
        counter = 0,
        tryToSearch = true;

    function loader() {
        if (!tryToSearch) return false;
        var json = getJSON(page, '/collections?', '&offset=' + offset + '&limit=' + limit);
        for (var i in json.data.collections) {
            page.appendItem(plugin.id + ':collection:' + json.data.collections[i].id + ':' + escape(json.data.collections[i].title), "video", {
                title: json.data.collections[i].title,
                icon: json.data.collections[i].image.image_original
            });
            counter++;
        }
        offset += limit;
        if (counter == +json.data.total || offset > +json.data.total) return tryToSearch = false;
        return true;
    }
    loader();
    page.loading = false;
    page.paginator = loader;
});

new page.Route(plugin.id + ":premieres", function(page, title) {
    setPageHeader(page, 'Премьеры');
    var offset = 0,
        limit = 20,
        counter = 0,
        tryToSearch = true;

    function loader() {
        if (!tryToSearch) return false;
        var json = getJSON(page, '/premieres?', '&offset=' + offset + '&limit=' + limit);
        counter = appendVideosToPage(page, json.data.video_list, counter);
        offset += limit;
        if (counter == +json.data.total || offset > +json.data.total) return tryToSearch = false;
        return true;
    };
    loader();
    page.loading = false;
    page.paginator = loader;
});

new page.Route(plugin.id + ":watchlater", function(page, title) {
    setPageHeader(page, 'Избранное');
    var offset = 0,
        limit = 20,
        counter = 0,
        tryToSearch = true;

    function loader() {
        if (!tryToSearch) return false;
        var json = getJSON(page, '/favorites?', '&offset=' + offset + '&limit=' + limit);
        counter = appendVideosToPage(page, json.data.video_list, counter);
        offset += limit;
        if (counter == +json.data.total || offset > +json.data.total) return tryToSearch = false;
        return true;
    };
    loader();
    page.loading = false;
    page.paginator = loader;
});

new page.Route(plugin.id + ":paid", function(page, title) {
    setPageHeader(page, 'Купленные фильмы');
    var offset = 0,
        limit = 20,
        counter = 0,
        tryToSearch = true;

    function loader() {
        if (!tryToSearch) return false;
        var json = getJSON(page, '/payments/full?', '&offset=' + offset + '&limit=' + limit);
        counter = appendVideosToPage(page, json.data.video_list, counter);
        offset += limit;
        if (counter == +json.data.total || offset > +json.data.total) return tryToSearch = false;
        return true;
    };
    loader();
    page.loading = false;
    page.paginator = loader;
});

function constructMultiopt(multiOpt, storageVariable) {
    if (!storageVariable)
        multiOpt[0][2] = true;
    else
        for (var i = 0; i < multiOpt.length; i++) {
            if (multiOpt[i][0] == storageVariable) {
                multiOpt[i][2] = true;
                break;
            }
        }
    return multiOpt;
}

var store = require('movian/store').create('options');
if (!store.showPaidContent)
    store.showPaidContent = JSON.stringify([[true, "Да", true], [false, "Нет"]]);


function constructMultiopt(multiOpt, value) {
    for (var i = 0; i < multiOpt.length; i++)
       if (multiOpt[i][0].toString() == value) 
           multiOpt[i][2] = true;
       else 
           multiOpt[i][2] = false;
    return multiOpt;
}

new page.Route(plugin.id + ":login", function(page) {
    loginAndGetConfig(page, true);
});

new page.Route(plugin.id + ":logout", function(page) {
    var result = popup.message("Вы уверены что хотите выйти из учетной записи?", true, true);
    if (result) {
        var json = JSON.parse(http.request(API + '/auth/logout?', {
            headers: {
                'User-Agent': UA
            },
            postdata: {
                'sign': cryptodigest('md5', k2) + k1
            }
        }));
        page.loading = false;
        if (json && json.result == 'ok') logged = true;
        logged = false;
    }
    page.flush();
    page.redirect(plugin.id + ':start');
});

new page.Route(plugin.id + ":start", function(page) {
    setPageHeader(page, plugin.synopsis);
    var isMultioptReady = false;
    var options = eval(store.showPaidContent);
    page.options.createMultiOpt('showPaidContent', "Отображать платный контент", options, function(v) {
        service.showPaidContent = (v === "true");
        if (isMultioptReady) {
            store.showPaidContent = JSON.stringify(constructMultiopt(options, v));
            page.flush();
            page.redirect(plugin.id + ':start');
        }
    });
    isMultioptReady = true;

    page.appendItem(plugin.id + ":search:", 'search', {
        title: 'Искать в ' + plugin.title
    });
    if (logged) {
        page.appendItem(plugin.id + ':logout', 'video', {
            title: new RichText(coloredStr(users.data.nickname ? users.data.nickname : users.data.email, orange) + ' (' + config.data.geo + ')'),
            icon: users.data.avatar,
            description: new RichText(coloredStr('Псевдоним: ', orange) + users.data.nickname + 
                coloredStr('<br>ID: ', orange) + users.data.user_id +
                coloredStr('<br>Email: ', orange) + users.data.email +           
                (users.data.credit_card ? coloredStr('<br>Карта: ', orange) + users.data.card_type + ' ' + users.data.credit_card : '') +
                (users.data.sex != 'unknown' ? coloredStr('<br>Пол: ', orange) + (users.data.sex == 'male' ? 'мужской' : 'женский') : '') +
                coloredStr(' Дата рождения: ', orange) + users.data.birthday)
        });
        //page.appendItem(plugin.id + ':watchlater', 'directory', {
        //    title: 'Избранное',
        //    icon: logo
        //});
        //page.appendItem(plugin.id + ':paid', 'directory', {
        //    title: 'Купленные фильмы',
        //    icon: logo
        //});
    } else {
        page.appendItem(plugin.id + ':login', 'file', {
            title: new RichText(coloredStr('Авторизация не проведена', orange) + ' (' + config.data.geo + ')')
        });
    }
    page.appendItem("", "separator", {
        title: 'Категории:'
    });
    for (i in config.data.categories) {
        page.appendItem(plugin.id + ':genres:' + config.data.categories[i].id + ':' + escape(config.data.categories[i].title), 'directory', {
            title: new RichText(unescape(config.data.categories[i].title)),
            icon: logo
        });
    };

    if (service.showPaidContent) {
        var json = getJSON(page, '/premieres?', '&limit=5');
        appendVideosToPage(page, json.data.video_list, 0, 'Премьеры:');
        page.appendItem(plugin.id + ':premieres', 'directory', {
            title: 'Все ►'
        });
    }

    digest = getJSON(page, '/digest?', 'limit=10');
    appendVideosToPage(page, digest.data.recommended, 0, 'Выбор редакции:');
    appendVideosToPage(page, digest.data.collections, 0, 'Подборки:');
    page.appendItem(plugin.id + ':collections', 'directory', {
        title: 'Все ►'
    });

    // Show lists
    for (var i in digest.data.videos) {
        for (var j in config.data.categories) { // traversing categories
            if (config.data.categories[j].title == 'TV') continue;
            if (config.data.categories[j].id == digest.data.videos[i].category_id) {
                page.appendItem("", "separator", {
                    title: config.data.categories[j].title
                });
                break;
            }
        }
        appendVideosToPage(page, digest.data.videos[i].video_list);
    };
    page.loading = false;
});		

function search(page, url, params, limit) {
    loginAndGetConfig(page, false);
    page.entries = 0;
    var offset = counter = 0, tryToSearch = true;

    function loader() {
        if (!tryToSearch) return false;
        var json = getJSON(page, url, params + '&offset=' + offset + '&limit=' + limit);
        counter = appendVideosToPage(page, json.data.video_list, counter);
        offset += 20;
        if (counter == +json.data.total || offset > +json.data.total) return tryToSearch = false;
        return true;
    };
    loader();
    page.loading = false;
    page.paginator = loader;
}

function escapeSpecials(str) {
    return str.replace(/[;,#_:@=!~'\-\/\\\?\&\+\$\.\*\(\)]/g, function(c) {
        return '%' + c.charCodeAt(0).toString(16);
    });
}

new page.Route(plugin.id + ":search:(.*)", function(page, query) {
    setPageHeader(page, plugin.title);
    search(page, '/search?', 'text=' + escapeSpecials(query), 20);
});

page.Searcher(plugin.id, logo, function(page, query) {
    search(page, '/search?', 'text=' + escapeSpecials(query), 20);
});
