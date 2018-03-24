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
	D.dialogWindow = $("#dialog_window").dialog({
		autoOpen: false,
		width: "80%",
		resizable: true,
		modal: true
	});
	// prepare the query editor window
	/*D.queryWindow = $("#query_window").dialog({
		autoOpen: false,
		width: "80%",
		modal: true
	});
	// prepare the debug window
	D.debugWindow = $("#debug_window").dialog({
		autoOpen: false,
		width: "100%",
		modal: true
	});*/
	// prepare the overlay div element
	D.overlay = $("#content_overlay");

	// fetch the list of tables (this will also trigger a login, load configuration, etc.)
	D.Tables = {};
	D.cmd('getTables', undefined, undefined, function (data) {
		D.Config = data.uiconfig;	// configuration passed from PHP
		// data.tables is an Object, with the SQL name as key and the description as value
		for (var tableName in data.tables) {
			D.Tables[tableName] = new Table(D, tableName, data.tables[tableName]);
		}
		D.initQueries(data.queries);

		// check if we are logged in: will be done implicitly by menu function
		D.menu();
		// show the home screen
		D.showHome();
	});
}

/*****
 ***** core helpers: interacting with the PHP interface (dbi.php)
 *****/

/* the main helper: run UniDB command on the server */
UniDB.prototype.cmd = function (command, table, parameters, callback, failCallback) {
	var D = this;	// safe in separate variable, since "this" points to sth else in callbacks
	
	this.createOverlay();	// activate overlay to grey out screen

	// process parameters
	if (typeof parameters == "undefined") {			// make empty Object if not given
		parameters = { };
	}
	parameters["__UniDB"] = command;
	if (typeof table !== "undefined") {			// table is optional, otherwise command is "global"
		parameters["__table"] = table;
	}

	// HERE THE REAL WORK COMES:
	return($.ajax({
		type: "POST",
		url: D.dbiUrl,
		data: parameters,
		dataType: "json",
		error: function(jqxhr, errorText, errorObject) {
			// lower level error (e.g. JSON parse error, timeout, ...) occured
			D.destroyOverlay();
			// now we show an error message:
			var addText = "";
			if (errorText == "parsererror") {
				addText = "\n\nData received:\n" + jqxhr.responseText;
			}
			// now a dialog window will be shown:
			window.confirm("Request to UniDB handler failed:\n\n" + errorText + ": " + errorObject + addText + "\n\nShow log?")
				&& D.printLog();
			// call failCallback, if specified
			if (typeof failCallback == "function") { failCallback(errorText); }
			return(false);
		},
		success: function(data) {
			if (data.UniDB_fatalError != undefined) {
				// error occured as a result of the command
				D.destroyOverlay();
				// now a dialog window will be shown:
				window.confirm("UniDB command failed with fatal error:\n\n"+data.UniDB_fatalError+"\n\nShow log?")
					&& D.printLog();
				// call failCallback, if specified
				if (typeof failCallback == "function") { failCallback(data.UniDB_fatalError); }
				return(false);
			}
			if (data.UniDB_requestLogin != undefined) {
				// we need to (re-)login: show a login form, and this will - if successful - call the original command (again)
				D.loginForm(command, table, parameters, callback, failCallback);
				return(false);
			}
			// function to deal with the data
			callback(data);
			// last step: re-enable form / remove overlay div
			D.destroyOverlay();
			return(true);
		}
	}));
}

/* loginForm(): show login window, called by cmd() if login is needed */
UniDB.prototype.loginForm = function (command, table, options, callback, failCallback) {
	var D = this;	// safe in separate variable, since "this" points to sth else in callbacks

	var loginForm = {	username: { label: "Username",	type: "char",		size: 20 },
				password: { label: "Password",	type: "password",	size: 20 }
			};
	// submit function
	new SimpleDialog(D, "login-form", "Please log in", loginForm, function(dialog, dialog_callback) {
		var loginData = {};
		loginData["login"] = "1";
		loginData["username"] = dialog.Fields["username"].value();
		loginData["password"] = dialog.Fields["password"].value();
		$.post(D.dbiUrl, loginData, function(data) {
			if (data.UniDB_fatalError != undefined || data.UniDB_motd == undefined) {
				window.alert("Login failed:\n\n"+data.UniDB_fatalError);
				D.loginForm(command, table, options, callback, failCallback);
			} else {
				D.motd = data.UniDB_motd;	// motd (usually connect info)
				$("#motd").text(D.motd);
				// if login successful we call the original command (which triggered the login)
				D.cmd(command, table, options, callback, failCallback);
			}
		}, "json");
		dialog_callback();
	}, function() {
		if (typeof failCallback == "function") { failCallback(); }
	}, B_OK );
}

/* logout(): obvious purpose */
UniDB.prototype.logout = function () {
	$("#motd").text("[logged out]");
	$.ajax(this.dbiUrl + "?logout=1");
}

/*****
 ***** local helpers: mainly UI-related
 *****/

/* T(): return Table object, this is basically a shortcut and similar to the equivalent function in PHP UniDB class */
UniDB.prototype.T = function (tableName) {
	return(this.Tables[tableName]);
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
	// empty array
	this.Queries = [];
	// data.queries is an Object, with the internal name as key and the description as value
	for (var queryName in queries) {
		this.Queries.push(new Table(this, queryName, queries[queryName]));
	}
	this.Queries.sort(function(a, b) {
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

/*****
 ***** actions: these are the actual functions offered by the UniDB class
 *****/

/* menu(): draw menu of table names) */
UniDB.prototype.menu = function () {
	var D = this;	// safe in separate variable, since "this" points to sth else in callbacks

	var menuContainer = $("#menu");	// PROVISIONAL HARD-CODED

	// empty container
	menuContainer.text("");
	// set logout and show log buttons
	$("<button/>", { id: "btnLogout", html: "Logout" })
		.button({ icons: { primary: "ui-icon-power" } })
		.on("click", function() { D.logout(); } )
		.prependTo(menuContainer);
	$("<button/>", { id: "btnLog", html: "Show log" })
		.button({ icons: { primary: "ui-icon-script" } })
		.on("click", function() { D.printLog(); } )
		.prependTo(menuContainer);
	// menu of queries 
	var menuQueries = $( "<ul/>", { id: "menuQueries" });
	menuQueries.hide()	// hide (pops up when we click button)
		.menu()
		.prependTo(menuContainer);
	$( "<button/>", { "role": "button", id: "btnQueries", html: "Queries" })
		.button({ icons: { primary: "ui-icon-search" }})
		.on("click",function(evnt) {
			// update queries from server
			D.cmd('getQueries', undefined, { mtime: D.mtime } , function (data) {
				D.mtime = data.mtime;
				if (data.queries) {
					D.initQueries(data.queries);
				}
				// empty menu
				$("#menuQueries").text("");
				var subMenus = { };
				// generate new entry for each query
				$.each(D.Queries, function (queryName, tableObject) { //for (var table in D.Tables) {
					var entry = $("<li/>");
					var category = null;
					var description = tableObject.description;
					if (description.indexOf(":") > -1) {
						category = description.substr(0, description.indexOf(":")).trimRight();
						description = description.substr(description.indexOf(":")+1).trimLeft();
					}
					$( "<a/>", { html: D.stripText(description) })
						.appendTo(entry)
						.on("click",function() {
							tableObject.reset();
							tableObject.show();
						})
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
				//$.each(subMenus, function(category, subMenu) {
					var entry = $("<li/>");
					$("<a/>", { html: category })
						.appendTo(entry);
					subMenus[category].appendTo(entry);
					entry.prependTo($("#menuQueries"));
				}
				$("#menuQueries").menu("refresh")
					.show()
					.position({
						my: "left top",
						at: "left bottom",
						of: evnt.currentTarget
					});
			});
			// important: otherwise the next handler would be called and hides the menu again...
			evnt.stopPropagation();
		})
		.prependTo(menuContainer);
	// menu of tables
	var menuTables = $( "<ul/>", { id: "menuTables" });
	$.each(D.Tables, function (table, tableObject) { //for (var table in D.Tables) {
		if (!tableObject.hidden) {
			$( "<a/>", { html: tableObject.description })
				.appendTo(menuTables)
				.on("click",function() {
					tableObject.reset();
					tableObject.show();
				})
				.wrap($("<li/>"));
		}
	});
	menuTables.hide()	// hide (pops up when we click button)
		.menu()		// make it a menu
		.prependTo(menuContainer);
	$( "<button/>", { "role": "button", id: "btnTables", html: "Tables" })
		.button({ icons: { primary: "ui-icon-calculator" }})
		.on("click",function(evnt) {
			menuTables.show().position({
				my: "left top",
				at: "left bottom",
				of: this
			});
			// important: otherwise the next handler would be called and hides the menu again...
			evnt.stopPropagation();
		})
		.prependTo(menuContainer);
	// blank menu for download via templates
	$("<ul/>", { id: "downloadOneMenu" })
		.appendTo(menuContainer)
		.menu()
		.hide();
	// if we click anywhere else, the menu should be hidden
	$(document).on( "click", function() {
		menuTables.hide();
		menuQueries.hide();
		$("#downloadOneMenu").hide();
	});
	// home button
	$("<button/>", { id: "btnHome", html: "Home" })
		.button({ icons: { primary: "ui-icon-home" } })
		.on("click", function() { D.showHome(); } )
		.prependTo(menuContainer);
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
	// empty the content area and table-specific toolbars
	$("#content").text("");
	$("#tableinfo").text("");
	$("#navbar").text("");
	$("#searchbar").text("");
	// global search
	$("<input/>", { id: "search_term", type: "text", placeholder: "Search ..." })
		.prop("size","40")
		.appendTo("#content")
		.catcomplete({
			delay: 500,
			minLength: 3,
			source: function(request, response) {
				D.cmd('search', undefined, { search: request.term }, response);
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
		})
		.wrap($("<div/>", { id: "global_search" }));
	// ad-hoc query
	$("<input/>", { id: "adhoc_sql", type: "text", placeholder: "SELECT * FROM ..." })
		.prop("size","40")
		.appendTo("#content")
		.keypress(function(evnt) {
			if (evnt.which == 13) {
				D.cmd('newSimpleQuery', undefined, { userQuery: true, sql: evnt.target.value }, function(response) {
					var newQuery = new Table(D, response.name, response.info);
					D.Queries.push(newQuery);
					newQuery.show();
				});
				return(false);
			}
		})
		.wrap($("<div/>", { id: "adhoc_query" }));
}

/* printLog(): show the PHP backend log in a window */
UniDB.prototype.printLog = function () {
	var D = this;	// safe in separate variable, since "this" points to sth else in callbacks

	D.cmd("printLog", undefined, undefined, function(data) {
		new SimpleDialog(	D,
					"form-debug",
					"UniDB log",
					{ debug: {	type: "raw",
							value: $("<pre/>", {	id:	"debug",
										html:	data.UniDB_log }) } },
					undefined,
					undefined,
					B_CLOSE );
	});
}

