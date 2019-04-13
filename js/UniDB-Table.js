
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
	this.section = parameters.section;		// "table" or "query"
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
	T.D.cmd('GET', '/' + T.section + '/' + T.tableName, T.options, function (data) {
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
			$("<button/>", { html: "Fill template" } )
				.button({	text:	false,
						icons:	{ primary: "ui-icon-copy" }})
				.click(	{ 	T:	(T.underlyingTable ? T.D.T(T.underlyingTable) : T ) ,
						value:	thisKey } , T.downloadOneFunction )
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
		T.D.cmd('POST', '/' + T.section + '/' + T.tableName + '/lock', { }, function (lock) {
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
				T.D.cmd("PUT", '/' + T.section + '/' + T.tableName,
					       { description:		dialog.Fields["description"].value(),
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
				T.D.cmd('DELETE', '/' + T.section + '/' + T.tableName + '/lock', { hash: lockHash });
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
	this.D.cmd('GET', '/' + this.section + '/' + this.tableName, $.extend({ "download": true }, this.options),
		function (data) {
			var CSV = new Blob([ data ], { type: MIME_CSV } );
			var url = URL.createObjectURL(CSV);
			document.location = url;
		}, undefined, MIME_CSV );
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
		&& T.D.cmd("DELETE", "/" + T.section + "/" + T.tableName + "/" + evnt.data.value, options, function () {
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

/* downloadOneFunction() : download record as ODF - function for file select event */
Table.prototype.downloadOne = function(evnt) {

	var T = $(evnt.target).data("T");
	var keyColumn = $(evnt.target).data("key");
	var keyValue = $(evnt.target).data("value");
	var file = evnt.target.files[0];

	JSZip.loadAsync(file).then(function(zip) {
		if (metaFile = zip.file("meta.xml")) {
			metaFile.async("string").then(
				function(data) {
					var metaXml = $.parseXML(data);
					var metaContainer = metaXml.getElementsByTagNameNS(NS_ODF_OFFICE, "meta")[0];
					var metaNodes = metaContainer.getElementsByTagNameNS(NS_ODF_META, "user-defined");
					T.D.cmd("GET", "/" + T.section + "/" + T.tableName + "/" + keyValue,
						{ "key": keyColumn, "download": true },
						function (record) {
							var metaOld = new Array;
							for(var i = 0; i < metaNodes.length; i++) {
								var metaName = metaNodes[i].getAttributeNS(NS_ODF_META, "name");
								if (typeof record[metaName] != "undefined") {
									metaOld.push(metaNodes[i]);
								}
							}
							for(var i in metaOld) {
								metaContainer.removeChild(metaOld[i]);
							}
							var metaPrefix = metaContainer.lookupPrefix(NS_ODF_META);
							for(var metaName in record) {
								var metaNew = document.createElementNS(NS_ODF_META, metaPrefix + ":user-defined");
								metaNew.innerHTML = record[metaName];
								metaNew.setAttributeNS(NS_ODF_META, metaPrefix + ":name", metaName);
								metaNew.setAttributeNS(NS_ODF_META, metaPrefix + ":value-type", "string");
								metaContainer.appendChild(metaNew);
							}
							var xs = new XMLSerializer();
							zip.file("meta.xml", xs.serializeToString(metaXml));
							zip.generateAsync({ type: 'blob', mimeType: MIME_ODF })
								.then(function (blob) {			// 1) generate the zip file as Blob
									var url = URL.createObjectURL(blob);
									document.location = url;	// 2) download Blob
								}, function (err) {
									window.alert(err);
								});
						}, undefined);
				},
				function(e) {
					window.alert("cannot read: "+e.message);
				});
		} else {
			window.alert("File meta.xml not found, are you sure it's an OpenOffice document?");
		}
	}, function (e) {
		window.alert("Error reading file: " + e.message);
	});
}

/* downloadOneFunction() : download record as ODF - function for button event */
Table.prototype.downloadOneFunction = function(evnt) {
	var T = ( evnt.data.T ? evnt.data.T : this );
	var input = $(document.createElement("input"));
	input.attr("type", "file")
		.data("T", T)
		.data("key", ( evnt.data.key ? evnt.data.key : T.priKey ))
		.data("value", evnt.data.value )
		.change(T.downloadOne)
		.trigger("click"); // opening dialog
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

