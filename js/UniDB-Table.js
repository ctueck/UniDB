
/*************************************************************************************************************/
/***** Class: Table - one instance is created for every table, when page is loaded             ***************/
/*****                (it persists throughout the session)                                     ***************/
/*************************************************************************************************************/

/*****
 ***** Constructor: called by UniDB constructor when receiving table list from server
 *****/

function Table (UniDB_instance, tableName, parameters) {
	this.D = UniDB_instance;	// pointer to parent UniDB instance
	this.tableName = tableName;	// SQL name
	// parameters is an Object received from dbi.php:
	this.description = parameters.description;	// Human-readable name
	this.hidden = parameters.hidden;
	this.priKey = parameters.priKey;
	this.searchable = parameters.searchable;
	this.underlyingTable = parameters.underlyingTable;
	this.allowNew = parameters.allowNew;
	this.allowEdit = parameters.allowEdit;
	this.allowDelete = parameters.allowDelete;
	// columns
	this.columns = parameters.columns;
	// templates
	this.templates = parameters.templates;
	// these are for user queries
	this.sql = parameters.sql;
	this.userQuery = parameters.userQuery;
	this.saveQuery = parameters.saveQuery;
	this.isPublic = parameters.isPublic;
	// call reset to initialise navigation values, filters, etc.
	this.reset();
}

/* reset(): clear options, such as filters, number of records to skip, ... */
Table.prototype.reset = function () {
	// options to be passed to dbi.php
	this.options = {};
}

/* show(): the main function of the class, list records  */
Table.prototype.show = function () {
	var T = this;	// safe in separate variable, since "this" points to sth else in callbacks
	var i, j;	// counters
	// set UniDB Object's current Table to this one
	T.D.currentTable = this;
	// run query
	T.D.cmd('GET', '/table/' + T.tableName, T.options, function (data) {
		// empty the content area and table-specific toolbars
		$("#content").text("");
		$("#tableinfo").text("");
		$("#navbar").text("");
		$("#searchbar").text("");
		// create navigation bar
		$("<button/>", { html: "first record" } )
			.button({ text: false, icons: { primary: "ui-icon-seek-start" }})
			.click(function() { T.options.skip = 0; T.show(); })
			.appendTo("#navbar");
		$("<button/>", { html: "page up" } )
			.button({ text: false, icons: { primary: "ui-icon-seek-prev" }})
			.click(function() { T.options.skip = data.pageUp; T.show(); })
			.appendTo("#navbar");
		$("<button/>",{ id: "refresh_table",
				html: data.firstRecord+"-"+data.lastRecord+" of "+data.totalRecords+" records" } )
			.button()
			.click(function() { T.show(); })	// basically this just reloads the table
			.appendTo("#navbar");
		$("<button/>", { html: "page down" } )
			.button({ text: false, icons: { primary: "ui-icon-seek-next" }})
			.click(function() { T.options.skip = data.pageDown; T.show(); })
			.appendTo("#navbar");
		$("<button/>", { html: "last page" } )
			.button({ text: false, icons: { primary: "ui-icon-seek-end" }})
			.click(function() { T.options.skip = data.lastPage; T.show(); })
			.appendTo("#navbar");
		$("#navbar").buttonset();
		// text search
		if (T.searchable) {
			$("<input/>", { id: "search_term", type: "text", placeholder: "Search table ...", value: T.options.search })
				.prop("size","25")
				.appendTo("#searchbar")
				.wrap($("<form/>", { name: "search_form", id: "search_form" }));
			$("#search_form").submit(function () {
				T.options.skip = 0;
				T.options.search = $("#search_term").val();
				T.show();
				return(false);
			});
		}
		// download (CSV) button
		$("<button/>", { html: "Download" } )
			.button({ icons: { primary: "ui-icon-arrowthickstop-1-s" }})
			.click(function() { T.download(); })
			.appendTo("#searchbar");
		// blank form needed to POST files
		$("<form/>", { id: "downloadOneForm", method: "POST", action: "dbi.php", enctype: "multipart/form-data" })
			.appendTo("#searchbar");
		// new record button (unless for VIEW's)
		if (T.allowNew) {
			$("<button/>", { html: "New" } )
				//.data( { "table": (data.underlyingTable ? data.underlyingTable : table ), "options": options } )
				.button({ icons: { primary: "ui-icon-document" }})
				.click( function() {
					new Record( (T.underlyingTable ? T.D.T(T.underlyingTable) : T ), undefined,
						function(newRecord) {
							if (T.options.filterColumn) {
								newRecord.Fields[T.options.filterColumn].oldValue = T.options.filterValue;
							}
							new Dialog(T.D.dialogWindow, newRecord);
						});
				})
				.appendTo("#searchbar");
		}
		// table info
		if (T.userQuery) {
			$("<a/>", { href: "#", html: "Edit",  "class": "foreign-table-button" } )
				.button({ text: false, icons: { primary: "ui-icon-pencil" }})
				.click(function() { T.modify(); })
				.appendTo("#tableinfo");
		}
		// show table/query name
		$("<span/>", { html: T.D.stripText(T.description, true, data.filterInfo) })
			.appendTo("#tableinfo");
		// now make an actual table
		$("<table/>", { id: "content_table" })
			.appendTo("#content");
		$("<tr/>", { id: "column_names" })
			.wrap("<thead/>")
			.appendTo("#content_table");
		for (var i=0; i < data.columns.length; i++) {
			$("<th/>", {	"class": ( (T.options.order == data.columns[i].name)
						|| (T.options.order == data.columns[i].name + " DESC") ? "column-sorted" : undefined ),
			// first header spans two columns: action buttons and first data column
					colspan: ( (i == 0) ? 2 : 1 ) })
				.append( $("<button/>", { href: "#", html: data.columns[i].description, "class": "sort-button" } )
					.button({ icons: { secondary: ( T.options.order == data.columns[i].name ?
					"ui-icon-triangle-1-n" : ( T.options.order == data.columns[i].name + " DESC" ?
					"ui-icon-triangle-1-s" : "ui-icon-triangle-2-n-s" ) ) }}) )
				.click( {	T:	T,
						column:	data.columns[i].name,
						desc:	( T.options.order == data.columns[i].name ? 1 : 0 ) } ,
					T.sortFunction )
				.appendTo("#column_names");
		}
		for (var i=0; i < data.keys.length; i++) {
			var thisKey = data.keys[i];
			var row = $("<tr/>", { id: "data_"+thisKey });
			row.click(T.rowClickFunction);
			var actButtons = $("<td/>").addClass("edit-delete-buttons");
			$("<button/>", { html: (T.allowEdit ? "Edit" : "View") } )
				.button({	text:	false,
						icons:	{ primary: (T.allowEdit ? "ui-icon-pencil" : "ui-icon-search") }})
				.click(	{ 	T:	(T.underlyingTable ? T.D.T(T.underlyingTable) : T ),
						value:	thisKey } , T.editFunction )
				.appendTo(actButtons);
			$("<button/>", { html: "Download" } )
				.button({	text:	false,
						icons:	{ primary: "ui-icon-arrowthickstop-1-s" }})
				.click(	{ 	T:	(T.underlyingTable ? T.D.T(T.underlyingTable) : T ) ,
						value:	thisKey } , T.downloadOneMenu )
				.appendTo(actButtons);
			if (T.allowDelete) {
				$("<button/>", { html: "Delete" } )
					.button({ text: false, icons: { primary: "ui-icon-trash" }})
					.click( {	T:	(T.underlyingTable ? T.D.T(T.underlyingTable) : T ),
							value:	thisKey,
							name:	data.data[i][data.nameColumn] } , T.deleteFunction )
					.appendTo(actButtons);
			}
			actButtons.buttonset();
			actButtons.appendTo(row);
			for (j=0; j < data.data[i].length; j++) {
				$("<td/>", { html: T.D.stripText(data.data[i][j], true) }).appendTo(row);
			}
			row.appendTo("#content_table");
		}
	}); // D.cmd
}

/* modify() : edit user query */
Table.prototype.modify = function () {
	var T = this;

	if (this.userQuery) {	// if not userQuery, it cannot be modified
		// first, we need to create a lock
		T.D.cmd("lock", T.tableName, { }, function(lock) {
			// if successful, we receive a hash that we later need to unlock
			var lockHash = lock.hash;
			// menu of tables & columns
			var tableSelect = [ [ null, "none (no edit/delete)" ] ];
			var columnSelect = $("<ul/>");
			$("<li/>", { html: "Columns:" } ).appendTo(columnSelect);
			$("<li/>", { html: "-" } ).appendTo(columnSelect);
			$.each(T.D.Tables, function(table, tableObj) {
				tableSelect.push([ table, table + ": " + tableObj.description ]);
				var thisTable = $("<li/>");
				$("<a/>", { html: tableObj.description }).appendTo(thisTable);
				var tableColumns = $("<ul/>");
				$.each(tableObj.columns, function(column, description) {
					$("<a/>", { html: column + ": " + description })
						.appendTo(tableColumns)
						.on("click", function (e) {
							var oldVal = $("#-sql").val();
							var pos = oldVal.length;	// default: at the end
							var posEnd = pos;
							// if query is focused, add at cursor position/replace marked text
							if ($("#-sql").is(":focus")) {
								pos = $("#-sql").prop("selectionStart");
								posEnd = $("#-sql").prop("selectionEnd");
							}
							var insert = table + "." + column;
							// add space before/after if not already there
							if ( (pos > 0) && (oldVal.charAt(pos-1) != " ") ) {
								insert = " " + insert;
							}
							if ( (posEnd < oldVal.length) && (oldVal.charAt(posEnd) != " ") ) {
								insert = insert + " ";
							}
							// set new string
							var newVal = oldVal.substr(0, pos) + insert + oldVal.substr(posEnd);
							$("#-sql").val(newVal);
							// position cursor after inserted text, mark nothing
							$("#-sql").prop("selectionStart", pos + insert.length);
							$("#-sql").prop("selectionEnd", pos + insert.length);
						})
						.wrap($("<li/>"));
				});
				tableColumns.appendTo(thisTable);
				thisTable.appendTo(columnSelect);
			});
			columnSelect.menu();
			var form = {
				       columns: {			type: "raw",		value: columnSelect },
					  name: { label: "ID",		type: "readonly",	value: T.tableName },
				   description: { label: "Name",	type: "char", size: 50,	value: T.description },
					   sql: { label: "SQL",		type: "text", size: 50,	value: T.sql },
			       underlyingTable: { label: "Main table",	type: "select",		value: T.underlyingTable, options: tableSelect },
				     saveQuery: { label: "Save?",	type: "checkbox",	value: T.saveQuery },
				      isPublic: { label: "Public?",	type: "checkbox",	value: T.isPublic }
				};
			new SimpleDialog(T.D, "edit-query", "Edit Query", form, function(dialog, callback) {
				T.D.cmd("modify", T.tableName, { description:		dialog.Fields["description"].value(),
								 sql:			dialog.Fields["sql"].value(),
								 underlyingTable:	dialog.Fields["underlyingTable"].value(),
								 saveQuery:		dialog.Fields["saveQuery"].value(),
								 isPublic:		dialog.Fields["isPublic"].value() ,
								 hash:			lockHash,
								 userQuery:		true },
					function(result) {
						T.constructor(T.D, T.tableName, result);
						T.show();
						callback();
					});
			}, function(dialog) {
				T.D.cmd("unlock", T.tableName, { hash: lockHash }, function() {});
			});
		});
	} else {
		console.log("Warning: tried to modify system Query - ignored.");
	}
}

/* download(): download current list as CSV file (called by download button click) */
Table.prototype.download = function () {
	// we extend an empty object, in order not to modify the existing options, and the skip value is removed
	// (= download is always complete)
	window.location.href = "dbi.php?" + $.param($.extend({}, this.options,
				{ "__UniDB": "download", "__table": this.tableName, "skip": undefined }));
	return(false);
}

/***
 *** Event handlers:
 ***
 *** These functions all get their parameters through the data Object part of the event Object.
 ***
 *** Since 'this' usually refers to the event, they all normally need a parameter 'T',
 *** referring to the Table object. If function is not called as an event handler, 'T'
 *** does not need to be specified and 'this' will be used.
 ***
 ***/

/* sortFunction(): sort by specified column */
Table.prototype.sortFunction = function (evnt) {
	var T = ( evnt.data.T ? evnt.data.T : this );
	console.log(evnt.data);
	T.options.order = ( evnt.data.desc ? evnt.data.column + " DESC" : evnt.data.column );
	T.skip = 0;
	T.show();
}

/* deleteFunction(): delete one record after confirmation (called by delete button click) */
Table.prototype.deleteFunction = function (evnt) {
	var T = ( evnt.data.T ? evnt.data.T : this );
	var options = {};
	options[T.priKey] = evnt.data.value;
	window.confirm("Are you sure you want to delete " + (evnt.data.name ? evnt.data.name : evnt.data.value)+"?")
		&& T.D.cmd("DELETE", "/table/" + T.tableName + "/" + evnt.data.value, options, function () {
			T.show();	// afterwards, refresh the current view
		} );
	if (typeof evnt.stopPropagation === "function") { 
		evnt.stopPropagation();
	}
}

/* editFunction() : edit record specified by data */
Table.prototype.editFunction = function(evnt) {
	var T = ( evnt.data.T ? evnt.data.T : this );
	new Record(T, evnt.data.value, evnt.data.key, function(newRecord) {
		new Dialog(T.D.dialogWindow, newRecord);
	});
	if (typeof evnt.stopPropagation === "function") { 
		evnt.stopPropagation();
	}
}

/* downloadOneMenu() : download the record specified, in server template or local file */
Table.prototype.downloadOneMenu = function(evnt) {
	console.log(evnt);
	var T = ( evnt && evnt.data && evnt.data.T ? evnt.data.T : this );
	if ($("#downloadOneMenu").data("isOpen")) {
		$("#downloadOneMenu").data("isOpen",0).hide();
	} else {
		$("#downloadOneMenu").data("isOpen",1);
		$("#downloadOneMenu").text("");
		$.each(T.templates, function(undefined, template) {
			$("<a/>", { html: template.description })
				.appendTo("#downloadOneMenu")
				.click( { T: T, key: evnt.data.key, value: evnt.data.value, template: template.name },
					T.downloadOneFunction )
				.wrap("<li/>");
		});
		$("<a/>", { html: "Upload file..." })
			.appendTo("#downloadOneMenu")
			.click( { T: T, key: evnt.data.key, value: evnt.data.value, template: undefined }, T.downloadOneFunction)
			.wrap("<li/>");
		$("#downloadOneMenu").menu("refresh")
			.show()
			.position({
				my: "left top",
				at: "left bottom",
				of: evnt.currentTarget
			});
	}
	if (typeof evnt.stopPropagation === "function") { 
		evnt.stopPropagation();
	}
}

/* downloadOneFunction() : download the record specified by data as ODF */
Table.prototype.downloadOneFunction = function(evnt) {
	var T = ( evnt.data.T ? evnt.data.T : this );
	// close the menu
	$("#downloadOneMenu").hide();
	// clear form
	$("#downloadOneForm").text("");
	// add form fields
	$("<input/>", { type: "hidden", name: "__UniDB", value: "downloadOne" })
		.appendTo("#downloadOneForm");
	$("<input/>", { type: "hidden", name: "__table", value: T.tableName })
		.appendTo("#downloadOneForm");
	$("<input/>", { type: "hidden", name: ( evnt.data.key ? evnt.data.key : T.priKey ), value: evnt.data.value })
		.appendTo("#downloadOneForm");
	if (evnt.data.template) {	// we want to download a template
		$("<input/>", { type: "hidden", name: "__template", value: evnt.data.template })
			.appendTo("#downloadOneForm");
		$("#downloadOneForm").submit();
	} else {			// we want to upload our own file
		$("<input/>", { type: "hidden", name: "MAX_FILE_SIZE", value: "5000000" })
			.appendTo("#downloadOneForm");
		$("<input/>", { type: "file", name: "__odtfile" })
			.appendTo("#downloadOneForm")
			.change(function () { $("#downloadOneForm").submit(); })
			.click();
	}
	if (typeof evnt.stopPropagation === "function") { 
		evnt.stopPropagation();
	}
}

Table.prototype.relatedFunction = function(evnt) {
	var T = ( evnt.data.T ? evnt.data.T : this );
	T.reset();
	T.options.filterTable = T.tableName;
	T.options.filterColumn = evnt.data.relatedColumn;
	T.options.filterValue = evnt.data.value;
	T.show();
	T.D.dialogWindow.dialog("close");
	if (evnt.data.count == 0) {	// we immediately create a new record
		new Record(T, undefined,
			function(newRecord) {
				newRecord.Fields[evnt.data.relatedColumn].oldValue = evnt.data.value;
				new Dialog(T.D.dialogWindow, newRecord);
			});
	}
}

/* rowClickFunction() : mark (= highlight) or unmark a row in the table */
Table.prototype.rowClickFunction = function(evnt) {
	if ($(evnt.currentTarget).hasClass('selected')) {
		$(evnt.currentTarget).removeClass('selected');
	} else {
		$(evnt.currentTarget).addClass('selected');
	}
}

