/*
 * UniDB.js
 */

// constants

// Table permissions
const P_NEW =		1;	// create records
const P_EDIT =		2;	// edit records
const P_DELETE =	4;	// delete records
const P_ALL =		7;	// full

// Table flags

// Related button functionality
const R_NEW =		1;	// show button in parent record if no records exist
const R_EXIST =		2;	// show button in parent record if records exist
const R_AUTOLOAD =	4;	// open record together with parent record (if key is UNIQUE)
const R_DEFAULT =	7;	// default: all related options active

// dialog buttons
const B_OK =		1;	// applyFunction + closeFunction
const B_APPLY =		2;	// applyFunction only
const B_CANCEL =	4;	// closeFunction only
const B_ALL =		7;	// OK, Apply, Cancel
const B_CLOSE =		8;	// same as Cancel, but labelled Close

// XML namespaces for Open Document Format files
const NS_ODF_OFFICE =	"urn:oasis:names:tc:opendocument:xmlns:office:1.0";
const NS_ODF_META =	"urn:oasis:names:tc:opendocument:xmlns:meta:1.0";

// MIME types
const MIME_JSON =	"application/json";
const MIME_ODF =	"application/vnd.oasis.opendocument.text";
const MIME_CSV =	"text/csv";

// autocomplete widget with different categories:
$.widget( "custom.catcomplete", $.ui.autocomplete, {
	_renderMenu: function( ul, items ) {
		var that = this,
			currentCategory = "";
		$.each( items, function( index, item ) {
			if ( ( item.category != currentCategory ) && ( item.category != undefined ) ) {
				ul.append( "<li class='ui-autocomplete-category'>" + item.category + "</li>" );
				currentCategory = item.category;
			}
			that._renderItemData( ul, item );
		});
	},
	_suggest: function( items ) {
		var ul = this.menu.element.empty();
		this._renderMenu( ul, items );
		this.isNewMenu = true;
		this.menu.refresh();
		// size and position menu
		ul.show();
		if ( this.options.autoFocus ) {
			this.menu.next();
		}
	}
});

/*************************************************************************************************************/
/***** Class: UniDB - the "root" class, interacting with the backend (dbiUrl, usually dbi.php) ***************/
/*************************************************************************************************************/

/*****
 ***** Constructor: should be run when page is loaded
 *****/

function UniDB(dbiUrl) {
	var D = this;	// safe in separate variable, since "this" points to sth else in callbacks

	// argument: URL of the dbi.php file
	D.dbiUrl = dbiUrl;

	// prepare the general dialog window
	D.dialogWindow = $("#dialog_window").dialog({ autoOpen: false });

	// prepare the overlay div element
	D.overlay = $("#content_overlay");

	// fetch the list of tables (this will also trigger a login, load configuration, etc.)
	D.Tables = {};
	D.cmd('GET', "/system/tables/", undefined, function (data) {
		D.Config = data.uiconfig;	// configuration passed from PHP
		D.motd = data.UniDB_motd
		// data.tables is an Object, with the SQL name as key and the description as value
		for (var tableName in data.tables) {
			D.Tables[tableName] = new Table(D, tableName, data.tables[tableName]);
		}
        D.cmd('GET', '/query/', undefined, function (data, jqxhr) {
            D.mtime = jqxhr.getResponseHeader("Last-Modified");
            D.initQueries(data);

            // construct menu
		    D.menu();
            D.queriesMenu();

            // set up navigation
            D.path = new Object;
            $(window).on("hashchange", D, D.doAction);
            D.doAction();
        });
	});

}

/* navigate to specific view - changes hash, then doAction() will trigger desired action */
UniDB.prototype.navigate = function(section, object, options) {
	var newHash = "#/" + encodeURIComponent(section) + "/" + encodeURIComponent(object) + "/";
	for(var i in options) {
		if (Array.isArray(options[i])) {
			for(var j in options[i]) {
				newHash = newHash + encodeURIComponent(i) + "=" + encodeURIComponent(options[i][j]) + "/";
			}
		} else if (typeof options[i] == "object") {
			for(var j in options[i]) {
				newHash = newHash + encodeURIComponent(i) + "="  + encodeURIComponent(j) + "="+ encodeURIComponent(options[i][j]) + "/";
			}
		} else if (options[i] != null) {
			newHash = newHash + encodeURIComponent(i) + "=" + encodeURIComponent(options[i]) + "/";
		}
	}
	window.location.hash = newHash;
}

/* listener for hashchange event, change view accordingly */
UniDB.prototype.doAction = function(evnt) {

	if (evnt) {
		var D = evnt.data;
	} else {
		var D = this;
	}

	// check parameters
	if (window.location.hash.length > 1) {
		if (window.location.hash.substr(0,2) != "#/") {
			console.log("malformed address, redirecting to home");
			window.location.hash = "#";
			return;
		}
		var components = window.location.hash.substr(2).split("/");
		D.path = {	"section"	: decodeURIComponent(components[0]),
				"object"	: decodeURIComponent(components[1]),
				"options"	: new Object };

        function sanitizeValue (input) {
            if (input.length == 0) {
                return(null);
            } else {
                var n = Number(input)
                if (isNaN(n)) {
                    return(input);
                } else {
                    return(n);
                }
            }
        }

		var options = components.slice(2);
		for(var i in options) {
			if (options[i].length > 0) {
				var option = options[i].split("=");
				if (option.length == 1) {
					D.path.options[decodeURIComponent(option[0])] = true;
				} else if (option.length == 2) {
					if (typeof D.path.options[decodeURIComponent(option[0])] == "undefined") {
						D.path.options[decodeURIComponent(option[0])] = sanitizeValue(decodeURIComponent(option[1]));
					} else if (typeof D.path.options[decodeURIComponent(option[0])] == "object") {
						D.path.options[decodeURIComponent(option[0])].push(sanitizeValue(decodeURIComponent(option[1])));
					} else {
						D.path.options[decodeURIComponent(option[0])] = [ D.path.options[decodeURIComponent(option[0])] ];
						D.path.options[decodeURIComponent(option[0])].push(sanitizeValue(decodeURIComponent(option[1])));
					}
				} else if (option.length == 3) {
					if (typeof D.path.options[decodeURIComponent(option[0])] == "undefined") {
						D.path.options[decodeURIComponent(option[0])] = { };
					}
					D.path.options[decodeURIComponent(option[0])][decodeURIComponent(option[1])] = sanitizeValue(decodeURIComponent(option[2]));
				}
			}
		}
        //console.log("Options: ", D.path.options);
		var object = null;
		if (D.path.section == "table") {
			object = D.T(D.path.object);
		} else if (D.path.section == "query") {
			object = D.Q(D.path.object);
		} else if (D.path.section == "logout") {
			D.logout();
			return;
		} else {
			console.log("Section [" + D.path.section + "] unknown.");
			return;
		}
		if (object != null) {
			object.options = D.path.options;
			object.show();
		} else {
			console.log("Object [" + D.path.object + "] not found in section [" + D.path.section + "].");
		}
	} else {
		D.showHome();
	}

}

/*****
 ***** core helpers: interacting with the PHP interface (dbi.php)
 *****/

/* the main helper: run UniDB command on the server */
UniDB.prototype.cmd = function (method, path, parameters, callback, failCallback, returnType, requestHeaders, noOverlay) {
	var D = this;	// safe in separate variable, since "this" points to sth else in callbacks

	if (! noOverlay) {
		this.createOverlay();	// activate overlay to grey out screen
	}

	// return type is JSON unless otherwise specified
	if (typeof returnType == "undefined") {
		returnType = "application/json";
	}
	// process parameters
	if (typeof parameters == "undefined") {			// make empty Object if not given
		parameters = { };
	}
	// additional request headers
	if (typeof requestHeaders == "undefined") {			// make empty Object if not given
		requestHeaders = { };
	}

    if ([ 'GET', 'PUT', 'POST', 'DELETE', 'OPTIONS' ].includes(method) && path) {

		requestHeaders["Accept"] = returnType;

        if (path.slice(-1) != '/') {
            path += '/';
        }

		// If we don't have a session token and the present call is not to the login
		// endpoint, we show a login form.
		if (window.sessionStorage.getItem("token")) {
			// pass our session token in Auth header
			requestHeaders["Authorization"] = "Bearer " + window.sessionStorage.getItem("token");
		} else if (path != "/login/") {
            // show login
			return(D.loginForm(method, path, parameters, callback, failCallback));
        }

        // work-around to make sure also OPTIONS has parameters in query string
        if ([ 'GET', 'OPTIONS' ].includes(method)) {
            if (Object.keys(parameters).length > 0) {
                path += '?' + $.param(parameters);
            }
            data = undefined;
            contentType = undefined;
        } else {
            data = JSON.stringify(parameters);
            contentType = "application/json";
        }
        return($.ajax({
			type: method,								// method will be passed through
			url: D.dbiUrl + path ,						// URL = base URL + path
			headers: requestHeaders ,
			data: data,	                                // we'll send the paramterers as JSON object
			processData: false,			                // thus, no processing ...
			contentType: contentType,               	// and content-type set accordingly
			dataType: ( returnType == "application/json" ? "json" : "text" )	// if we expect JSON back, treat as such
            }).done(function(data, statusText, jqxhr) {
				// function to deal with the data
				if (typeof callback == "function") { callback(data, jqxhr); }
				// last step: re-enable form / remove overlay div
				D.destroyOverlay();
				return(true);
			}).fail(function(jqxhr, errorText, errorObject) {
				// other error (e.g. JSON parse error, timeout, ...) occured
				D.destroyOverlay();
				// now we show an error message:
				var addText = "Request failed: " + errorText +
						"\n\nRequest: " + method + " " + D.dbiUrl + path +
						"\n\nHTTP Status: " + jqxhr.status + " " + jqxhr.statusText +
						( errorObject ? "\n\nerrorObject: " + errorObject : "" );
				if (errorText == "parsererror") {
					addText += "\n\nData received: " + jqxhr.responseText;
				}
				// call failCallback, if specified
				if (typeof failCallback == "function") {
					failCallback(errorText, jqxhr.responseJSON);
				} else {
				    // now a dialog window will be shown:
				    window.alert(addText);
					return(false);
				}
			}));
    } else {
        if (path) {
            console.log("Method [" + method + "] is invalid.");
        } else {
            console.log("No path given for API call.");
        }
    }
}

/* loginForm(): show login window, called by cmd() if login is needed */
UniDB.prototype.loginForm = function (method, path, options, callback, failCallback) {
	var D = this;	// safe in separate variable, since "this" points to sth else in callbacks

	var loginForm = {	username: { label: "Username",	type: "string",		size: 20 },
						password: { label: "Password",	type: "password",	size: 20 }
			};
	// submit function
	new SimpleDialog(D, "login-form", "Please log in", loginForm, function(dialog, dialog_callback) {
		var loginData = {};
		loginData["username"] = dialog.Fields["username"].value();
		loginData["password"] = dialog.Fields["password"].value();
		D.cmd("POST", "/login/", loginData, function(data) {
				if (data.token) {
	                window.sessionStorage.setItem("token", data.token);
					D.motd = data.UniDB_motd;	// motd (usually connect info)
					// if login successful we call the original command (which triggered the login)
					D.cmd(method, path, options, callback, failCallback);
				} else {
					window.alert("Login failed:\n\n" + data.non_field_errors);
					D.loginForm(method, path, options, callback, failCallback);
				}
			}, function(errorText, data) {
				//window.alert("Login failed:\n\n" + data.non_field_errors);
				D.loginForm(method, path, options, callback, failCallback);
			});
		dialog_callback();
	}, function() {
		if (typeof failCallback == "function") { failCallback(); }
	}, B_OK );
}

/* logout(): obvious purpose */
UniDB.prototype.logout = function () {
	var D = this;
	if (window.sessionStorage.getItem("token")) {
        sessionStorage.removeItem('token');
		$("#motd").text("[logged out]");
	} else {
		window.alert("you're already logged out...");
	}
	window.location.hash = '#';
	window.location.reload();
}

/*****
 ***** local helpers: mainly UI-related
 *****/

/* T(): return Table object, this is basically a shortcut and similar to the equivalent function in PHP UniDB class */
UniDB.prototype.T = function (tableName) {
	return(this.Tables[tableName]);
}

/* Q(): return Query object */
UniDB.prototype.Q = function (queryName) {
	return(this.Queries[queryName]);
}

UniDB.prototype.createOverlay = function() {
	// if no window is open, we create an overlay
	if (!this.dialogWindow.dialog("isOpen")) {	
		this.overlay.addClass("ui-widget-overlay ui-front");
	}
}

UniDB.prototype.destroyOverlay = function() {
	this.overlay.removeClass("ui-widget-overlay ui-front");
}

UniDB.prototype.stripText = function(text, htmlMode, trailingText) {
	// strip a long string, if cuttext is given
	if ( text == null ) {
		if (htmlMode) {
			return($("<span/>", { html: "NULL", "class": "sql-null" }));
		} else {
			return("");
		}
	} else if ( (this.Config.cuttext) && (text.length > this.Config.cuttext) ) {
		if (htmlMode) {
			return($("<span/>", { title: text, text: text.substr(0,this.Config.cuttext-3)+"..."+(trailingText ? trailingText : "") }));
		} else {
			return(text.substr(0,this.Config.cuttext-3)+"...");
		}
	} else {
		if (htmlMode) {
			return($("<span/>", { text: text+(trailingText ? trailingText : "") }).html());
		} else {
			return(text+(trailingText ? trailingText : ""));
		}
	}
}

/* initialise query objects (on log in or when changes loaded from server) */
UniDB.prototype.initQueries = function(queries) {
	// empty object and array
	this.Queries = {};
	this.QueriesAlpha = [];
	// data.queries is an Object, with the internal name as key and the description as value
	for (var query of queries) {
		this.Queries[query.id]= new Query(this, query.id, query);
		this.QueriesAlpha.push(this.Queries[query.id]);
	}
	this.QueriesAlpha.sort(function(a, b) {
		var nameA = a.description.toUpperCase(); // ignore upper and lowercase
		var nameB = b.description.toUpperCase(); // ignore upper and lowercase
		if (nameA < nameB) {
			return -1;
		}
		if (nameA > nameB) {
			return 1;
		}
		return 0;
		});
}

/* build query menu */
UniDB.prototype.queriesMenu = function() {
	var D = this;	// safe in separate variable, since "this" points to sth else in callbacks

    // empty menu
    $("#menuQueries").text("");
    var subMenus = { };

    // generate new entry for each query
    $.each(D.QueriesAlpha, function (queryName, tableObject) { //for (var table in D.Tables) {
        var entry = $("<li/>");
        var category = null;
        var description = tableObject.description;
        if (description.indexOf(":") > -1) {
            category = description.substr(0, description.indexOf(":")).trimRight();
            description = description.substr(description.indexOf(":")+1).trimLeft();
        }
        $( "<a/>", {    html: D.stripText(description),
                href: "#/query/" + tableObject.tableName,
                title: description })
            .appendTo(entry);
        // edit submenu
        if (tableObject.userQuery) {
        $("<a/>", { html: "Edit", "class": "ui-icon-pencil" } )
            .appendTo(entry)
            .on("click",function() {
                tableObject.modify();
            })
            .wrap($("<ul/>", { "class": "small" }))
            .wrap($("<li/>"));
        }
        if (category != null) {
            if (subMenus[category] == undefined) {
                subMenus[category] = $("<ul/>");
            }
            entry.appendTo(subMenus[category]);
        } else {
            entry.appendTo($("#menuQueries"));
        }
    });
    for (var category in subMenus) {
        var entry = $("<li/>");
        $("<a/>", { html: category })
            .appendTo(entry);
        subMenus[category].appendTo(entry);
        entry.prependTo($("#menuQueries"));
    }

}

/* getPagesize(): return configured pagesize */
UniDB.prototype.getPagesize = function() {
    return(15);
}

/*****
 ***** actions: these are the actual functions offered by the UniDB class
 *****/

/* menu(): draw menu of table names) */
UniDB.prototype.menu = function () {
	var D = this;	// safe in separate variable, since "this" points to sth else in callbacks

	var menuPri = $("#menu_primary");
	var menuSec = $("#menu_secondary");

	// empty container
	menuPri.text("");
	menuSec.text("");
	// set logout and show log buttons
	$("<a/>", { id: "btnLogout", text: "Logout", href: "#/logout" })
		.button({ text: false, icons: { primary: "ui-icon-power" } })
		.prependTo(menuSec);
	// menu of queries 
	var menuQueries = $( "<ul/>", { id: "menuQueries" });
	menuQueries.hide()	// hide (pops up when we click button)
		.menu()
		.prependTo(menuPri);
	$( "<a/>", { "role": "button", id: "btnQueries", html: "Queries" })
		.button({ icons: { primary: "ui-icon-search", secondary: "ui-icon-carat-1-s" }})
		.on("click",function(evnt) {
			if (menuQueries.prop("style").display == 'block') {
				menuQueries.hide();
			} else {
				// update queries from server
				D.cmd('GET', '/query/', undefined, function (data, jqxhr) {
					if (jqxhr.status != "304" && data.results) {
						D.mtime = jqxhr.getResponseHeader("Last-Modified");
						D.initQueries(data);
                        D.queriesMenu();
					}
					$("#menuTables").hide();
					$("#menuQueries").menu("refresh")
						.show()
						.position({
							my: "left top",
							at: "left bottom",
							of: evnt.currentTarget
						});
				}, undefined, undefined, { "If-Modified-Since": D.mtime } );
			}
			// important: otherwise the next handler would be called and hides the menu again...
			evnt.stopPropagation();
		})
		.prependTo(menuPri);
	// menu of tables
	var menuTables = $( "<ul/>", { id: "menuTables" });
	$.each(D.Tables, function (table, tableObject) { //for (var table in D.Tables) {
		if (!tableObject.hidden) {
			$( "<a/>", {	html: tableObject.description,
					href: "#/table/" + tableObject.tableName })
				.appendTo(menuTables)
				/*.on("click",function() {
					tableObject.reset();
					tableObject.show();
				})*/
				.wrap($("<li/>"));
		}
	});
	menuTables.hide()	// hide (pops up when we click button)
		.menu()		// make it a menu
		.prependTo(menuPri);
	$( "<a/>", { "role": "button", id: "btnTables", html: "Tables" })
		.button({ icons: { primary: "ui-icon-calculator", secondary: "ui-icon-carat-1-s" }})
		.on("click",function(evnt) {
			$("#menuQueries").hide();
			if (menuTables.prop("style").display == 'block') {
				menuTables.hide();
			} else {
				menuTables.show().position({
					my: "left top",
					at: "left bottom",
					of: this
				});
			}
			// important: otherwise the next handler would be called and hides the menu again...
			evnt.stopPropagation();
		})
		.prependTo(menuPri);
	// blank menu for download via templates
	$("<ul/>", { id: "downloadOneMenu" })
		.appendTo(menuPri)
		.menu()
		.hide();
	// if we click anywhere else, the menu should be hidden
	$(document).on( "click", function() {
		menuTables.hide();
		menuQueries.hide();
		$("#downloadOneMenu").hide();
	});
	// home button
	$("<a/>", { id: "btnHome", html: "Home", href: "#" })
		.button({ text: false, icons: { primary: "ui-icon-home" } })
		.prependTo(menuPri);
}

/* showHome(): show the home screen, including global search field */
UniDB.prototype.showHome = function () {
	var D = this;	// safe in separate variable, since "this" points to sth else in callbacks

	// set window title
	if (D.Config.pagetitle) {
		document.title = D.Config.pagetitle;
	}
	// close all dialogs
	this.dialogWindow.dialog("close");
	//this.debugWindow.dialog("close");
	// set current table to none
	this.currentTable = undefined;
	// empty the content area and table-specific toolbars, and add motd
	$("#content").text("").addClass("homepage");
	$("#table_info").text("");
	$("#table_nav").text("");
	$("#table_buttons").text("");
	$("#table_search").text("");
	$("#motd").text(D.motd);
	// global search
    D.globalSearch($("#content"));
	// ad-hoc query
	$("<input/>", { id: "adhoc_sql", type: "text", placeholder: "SELECT * FROM ..." })
		.prop("size","40")
		.appendTo("#content")
		.keypress(function(evnt) {
			if (evnt.which == 13) {
				D.cmd('POST', '/query/', { is_shared: false, sql: evnt.target.value, description: 'Ad-hoc query: ' + evnt.target.value }, function(response) {
					var newQuery = new Query(D, response.id, response);
					D.Queries[response.id] = newQuery;
					D.QueriesAlpha.push(newQuery);
					newQuery.show();
				});
				return(false);
			}
		})
		.wrap($("<div/>", { id: "adhoc_query" }));
}

/* globalSearch(): return auto-complete input field for global search */
UniDB.prototype.globalSearch = function (target) {
    var D = this;
	$("<input/>", { id: "search_term", type: "text", placeholder: "Search ..." })
        .appendTo(target)
        .wrap($("<div/>", { id: "global_search", class: "ui-front" }))
		.prop("size","40")
		.catcomplete({
			appendTo: $("#content"),
			delay: 250,
			minLength: 3,
			source: function(request, response) {
                var requests = [];
                var results = [];
				$.each(D.Tables, function(table, T) {
				    if (T.includeGlobalSearch && T.searchable) {
                        requests.push(D.cmd('GET', '/' + T.section + '/' + T.tableName + '/select/', { search: request.term }, function(data) {
                            for (var line of data) {
                                results.push({
                                    table:      table,
									key:		T.priKey,
                                    value:      line[T.priKey],
                                    category:   T.description,
                                    label:      line._label
                                });
                            }
                        }));
                    }
                });
                $.when.apply($, requests).then(function() {
				    $.each(D.Tables, function(table, T) {
				        if (T.includeGlobalSearch && T.searchable && T.allowNew) {
							results.push({
                                    table: 		table,
									key:		T.priKey,
									value:		null,
									category:	"Create new record",
									label:		T.description });
						}
                    });
                    response(results);
                }, function() { window.alert('something went wrong'); });
			},
			select: function(evnt, selection) {
				var T = ( D.T(selection.item.table).underlyingTable ?
					D.T(D.T(selection.item.table).underlyingTable) :
					D.T(selection.item.table) );
				T.editFunction( { data: { 	value:	selection.item.value,
								key:	selection.item.key } } );
				$("#search_term").val("");
				return(false);
			}
		});
}

