/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is DownThemAll API module.
 *
 * The Initial Developer of the Original Code is Nils Maier
 * Portions created by the Initial Developer are Copyright (C) 2009
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Nils Maier <MaierMan@web.de>
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

const EXPORTED_SYMBOLS = [
	"FilterManager",
	"Preferences",
	"Mediator",
	"Debug",
	"IOService",
	"URL",
	"SUPPORTED_HASHES",
	"SUPPORTED_HASHES_ALIASES",
	"Hash",
	"getLinkPrintHash",
	"getLinkPrintMetalink",
	"isLinkOpenable",
	"getProfileFile",
	"composeURL",
	"getRef",
	"saveSingleLink",
	"saveSingleItem",
	"getDropDownValue",
	"sendLinksToManager",
	"turboSendLinksToManager",
	"saveLinkArray",
	"turboSaveLinkArray",
	"openManager"
	
	
];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;
const module = Cu.import;
const Exception = Components.Exception;

module("resource://dta/utils.jsm");
const Preferences = {};
module("resource://dta/preferences.jsm", Preferences);
const Mediator = {};
module("resource://dta/mediator.jsm", Mediator);

ServiceGetter(this, "TextToSubURI", "@mozilla.org/intl/texttosuburi;1", "nsITextToSubURI");
ServiceGetter(this, "Debug", "@downthemall.net/debug-service;1", "dtaIDebugService");
ServiceGetter(this, "IOService", "@mozilla.org/network/io-service;1", "nsIIOService");
ServiceGetter(this, "FilterManager", "@downthemall.net/filtermanager;2", "dtaIFilterManager");
ServiceGetter(this, "DirectoryService", "@mozilla.org/file/directory_service;1", "nsIProperties");

function _decodeCharset(text, charset) {
	let rv = text;
	try {
		if (!charset.length) {
			throw 'no charset';
		}
		rv = TextToSubURI.UnEscapeAndConvert(charset, text);
	}
	catch (ex) {
		try {
			rv = decodeURIComponent(text);
		}
		catch (ex) {
			Debug.log("decodeCharset: failed to decode: " + text, ex);
		}
	}
	return rv;
}
// FlashGot compat.
// XXX Remove in 1.3
function DTA_URL(url, preference) {
	this.preference = preference || 100;

	try {
		if (url instanceof Ci.nsIURI) {
			url = url.QueryInterface(Ci.nsIURL);
		}
		if (!(url instanceof Ci.nsIURL)) {
			throw new Exception("you must pass an nsIURL");
		}

		this._url = url.clone();
	
		let hash = getLinkPrintHash(this._url);
		this._url.ref = '';		
		if (hash) {
			this.hash = hash;
		}
		this._usable = _decodeCharset(this._url.spec, this._url.originCharset);
	}
	catch (ex) {
		Debug.log("failed to set URL", ex);
		throw ex;
	}
};
var URL = DTA_URL;
URL.prototype = {
	get url() {
		return this._url;
	},
	get usable() {
		return this._usable;
	},
	toSource: function DU_toSource() {
		return {
			url: this._url.spec,
			charset: this._url.originCharset,
			preference: this.preference
		}
	},
	toString: function() this._url.spec
};

/**
 * Checks if a provided strip has the correct hash format Supported are: md5,
 * sha1, sha256, sha384, sha512
 * 
 * @param hash
 *          Hash to check
 * @return hash type or null
 */
const SUPPORTED_HASHES = {
	'MD5': {l: 32, q: 0.3 },
	'SHA1': {l: 40, q: 0.8 },
	'SHA256': {l: 64, q: 0.9 },
	'SHA384': {l: 96, q: 0.9 },
	'SHA512': {l: 128, q: 1 }
};
const SUPPORTED_HASHES_ALIASES = {
	'MD5': 'MD5',
	'MD-5': 'MD5',
	'SHA1': 'SHA1',
	'SHA': 'SHA1',
	'SHA-1': 'SHA1',
	'SHA256': 'SHA256',
	'SHA-256': 'SHA256',
	'SHA384': 'SHA384',
	'SHA-384': 'SHA384',
	'SHA512': 'SHA512',
	'SHA-512': 'SHA512'
};

function Hash(hash, type) {
	if (typeof(hash) != 'string' && !(hash instanceof String)) {
		throw new Exception("hash is invalid");
	}
	if (typeof(type) != 'string' && (!type instanceof String)) {
		throw new Exception("hashtype is invalid");
	}
	
	type = type.toUpperCase().replace(/[\s-]/g, '');
	if (!(type in SUPPORTED_HASHES_ALIASES)) {
		throw new Exception("hashtype is invalid: " + type);
	}
	this.type = SUPPORTED_HASHES_ALIASES[type];
	this.sum = hash.toLowerCase().replace(/\s/g, '');
	let h = SUPPORTED_HASHES[this.type];
	if (h.l != this.sum.length || isNaN(parseInt(this.sum, 16))) {
		throw new Exception("hash is invalid");
	}
	this._q = h.q;
}
Hash.prototype = {
	_q: 0,
	get q() {
		return this._hashLength;
	},
	toString: function() {
		return this.type + " [" + this.sum + "]";
	}
};

/**
 * Get a link-fingerprint hash from an url (or just the hash component)
 * 
 * @param url.
 *          Either String or nsIURI
 * @return Valid hash string or null
 */
function getLinkPrintHash(url) {
	if (!(url instanceof Ci.nsIURL)) {
		return null;
	}
	var lp = url.ref.match(/^hash\((md5|sha(?:-?(?:1|256|384|512))?):([\da-f]+)\)$/i); 
	if (lp) {
		try {
			return new Hash(lp[2], lp[1]);
		}
		catch (ex) {
			// pass down
		}
	}
	return null;
}

/**
 * Get a link-fingerprint metalink from an url (or just the hash component
 * 
 * @param url.
 *          Either String or nsIURI
 * @param charset.
 *          Optional. Charset of the orgin link and link to be created
 * @return Valid hash string or null
 */
function getLinkPrintMetalink(url) {
	if (!(url instanceof Components.interfaces.nsIURL)) {
		return null;
	}
	let lp = url.ref.match(/^!metalink3!(.+)$/);
	if (lp) {
		let rv = lp[1];
		try {
			rv = IOService.newURI(rv, url.originCharset, url);
			if (isLinkOpenable(rv.spec)) {
				return rv;
			}
		}
		catch (ex) {
			// not a valid link, ignore it.
		}
	}
	return null;
}

function isLinkOpenable(url) {
	if (url instanceof URL) {
		url = url.url.spec;
	}
	else if (url instanceof Ci.nsIURL) {
		url = url.spec;
	}
	try {
		var scheme = IOService.extractScheme(url);
		return ['http', 'https', 'ftp'].indexOf(scheme) != -1;
	}
	catch (ex) {
		// no op!
	}
	return false;
}

setNewGetter(this, "getProfileFile", function() {
	let _profile = DirectoryService.get("ProfD", Ci.nsIFile);
	return function(fileName) {
		var file = _profile.clone();
		file.append(fileName);
		return file;
	};
});


function composeURL(doc, rel) {
	// find <base href>
	let base = doc.location.href;
	let bases = doc.getElementsByTagName('base');
	for (var i = 0; i < bases.length; ++i) {
		if (bases[i].hasAttribute('href')) {
			base = bases[i].getAttribute('href');
			break;
		}
	}
	return IOService.newURI(rel, doc.characterSet, IOService.newURI(base, doc.characterSet, null));
}

function getRef(doc) {
	let ref = doc.URL;
	if (!isLinkOpenable(ref)) {
		let b = doc.getElementsByTagName('base');
		for (let i = 0; i < b.length; ++i) {
			if (!b[i].hasAttribute('href')) {
				continue;
			}
			try {
				ref = composeURL(doc, b[i].getAttribute('href')).spec;
			}
			catch (ex) {
				continue;
			}
			break;
		}
	}
	return isLinkOpenable(ref) ? ref: '';
}	

function getDropDownValue(name) {
	let values = eval(Preferences.getExt(name, '[]'));
	return values.length ? values[0] : '';
}

function saveSingleLink(window, turbo, url, referrer, description, postData) {
	let item = {
		'url': url,
		'referrer': referrer,
		'description': description ? description : ''
	};
	saveSingleItem(window, turbo, item);
}
function saveSingleItem(window, turbo, item) {
	if (turbo) {
		turboSendLinksToManager(window, [item]);
		return;
	}
	
	// else open addurl.xul
	window = window || Mediator.getMostRecent();
	window.openDialog(
		"chrome://dta/content/dta/addurl.xul",
		"_blank",
		"chrome, centerscreen, resizable=yes, dialog=no, all, modal=no, dependent=no",
		item
	);
}

function sendLinksToManager(window, start, links) {
	let win = Mediator.getMostRecent('DTA:Manager');
	if (win) {
		win.self.startDownloads(start, links);
		return;
	}
	
	window = window || Mediator.getMostRecent();
	window.openDialog(
		"chrome://dta/content/dta/manager.xul",
		"_blank",
		"chrome, centerscreen, resizable=yes, dialog=no, all, modal=no, dependent=no",
		start,
		links
	);
}

function turboSendLinksToManager(window, urlsArray) {
	let dir = this.getDropDownValue('directory');
	let  mask = this.getDropDownValue('renaming');

	if (!mask || !dir) {
		throw new Exception("missing required information");
	}

	var num = Preferences.getExt("counter", 0);
	if (++num > 999) {
		num = 1;
	}
	Preferences.setExt("counter", num);

	for (var i = 0; i < urlsArray.length; i++) {
		urlsArray[i].mask = mask;
		urlsArray[i].dirSave = dir;
		urlsArray[i].numIstance = num;
	}

	sendLinksToManager(window, !Preferences.getExt("lastqueued", false), urlsArray);
}

function saveLinkArray(window, urls, images, error) {
	if (urls.length == 0 && images.length == 0) {
		throw new Exception("no links");
	}
	window = window || Mediator.getMostRecent();
	window.openDialog(
		"chrome://dta/content/dta/select.xul",
		"_blank",
		"chrome, centerscreen, resizable=yes, dialog=no, all, modal=no, dependent=no",
		urls,
		images,
		error
	);
}
		
function turboSaveLinkArray(window, urls, images) {
	if (urls.length == 0 && images.length == 0) {
		throw new Exception("no links");
	}
	Debug.logString("turboSaveLinkArray(): DtaOneClick filtering started");

	let links;
	let type;
	if (Preferences.getExt("seltab", 0)) {
		links = images;
		type = 2;
	}
	else {
		links = urls;
		type = 1;
	}

	let fast = null;
	try {
		fast = FilterManager.getTmpFromString(this.getDropDownValue('filter'));
	}
	catch (ex) {
		// fall-through
	}
	links = links.filter(
		function(link) {
			if (fast && (fast.match(link.url.usable) || fast.match(link.description))) {
				return true;
			}
			return FilterManager.matchActive(link.url.usable, type);
		}
	);

	Debug.logString("turboSaveLinkArray(): DtaOneClick has filtered " + links.length + " URLs");

	if (links.length == 0) {
		throw new Exception('no links remaining');
	}
	this.turboSendToDown(window, links);		
}

function openManager(window, quiet) {
	try {
		let win = Mediator.getMostRecent('DTA:Manager');
		if (win) {
			if (!quiet) {
				win.focus();
			}
			return win;
		}
		window = window || Mediator.getMostRecent();
		window.openDialog(
			"chrome://dta/content/dta/manager.xul",
			"_blank",
			"chrome, centerscreen, resizable=yes, dialog=no, all, modal=no, dependent=no"
		);
		return Mediator.getMostRecent('DTA:Manager');
	} catch(ex) {
		Debug.log("openManager():", ex);
	}
	return null;
};