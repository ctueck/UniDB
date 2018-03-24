/*************************************************************************************************************/
/***** Class: Dialog - dialog window with one mainRecord and (optionally) related Records that ***************/
/*****                 are displayed in-line                                                   ***************/
/*************************************************************************************************************/

function Dialog (jqDialog, Record) {
	var realThis = this;	// for use in enclosures

	this.jqDialog = jqDialog;	// jQuery UI Dialog element
	this.mainRecord = Record;	// main Record object

	this.D = this.mainRecord.T.D;	// shortcut: UniDB instance

	if (this.mainRecord.key != undefined) {		// we have a Record object for an existing record
		if (this.mainRecord.T.allowEdit) {	// editable table
			this.title = "[Edit record]";
		} else {
			this.title = "Details";
		}
	} else {
		this.title = "[New record]";
	}

	// load related records, then show dialog
	this.loadRelated(function() {
		realThis.show();	// show main + related
	});

}

/* loadRelated(): recursively loads related records */
Dialog.prototype.loadRelated = function (callback, i) {
	var realThis = this;	// for use in enclosures

	i = (i ? i : 0);

	// make a new empty array
	if (i == 0) {
		this.relatedRecords = new Array;	// array of related Record objects
	}

	// initialise related records that have a UNIQUE relation and should be shown
	if (i < this.mainRecord.related.length) {
		var relation = this.mainRecord.related[i];	// shortcut
		// related records are only UNIQUE relations that exist:
		if ( (relation.count > 0) && (relation.unique) && (relation.mode & R_AUTOLOAD) ) {
			new Record(	realThis.D.T(relation.relatedTable),	// Table object of the related table
					relation.value,				// related column value
					relation.relatedColumn,			// related column
					function (newRecord) {
						realThis.relatedRecords.push(newRecord);
						realThis.loadRelated(callback, i+1);
					});
		} else {
			realThis.loadRelated(callback, i+1);
		}
	} else {
		// when no more related records are to be initialised, we call the ("ultimate") callback
		callback();
	}
}

Dialog.prototype.showRelated = function() {
	var realThis = this;	// for use in enclosures

	var hasRelatedTables = 0;				// flag (decides whether to show related line)
	var relatedTables = $("<div/>", { "class": "field", id: "related_records" } );

	// merge arrays of related tables
	var allRelated = this.mainRecord.related;
	for (var i in this.relatedRecords) {
		allRelated = allRelated.concat(this.relatedRecords[i].related);
	}
	// show buttons for non-UNIQUE relations
	$.each(allRelated, function(j, relation) {
		relation.T = realThis.D.T(relation.relatedTable);
		if ( ( (relation.count > 0) && (relation.mode & R_EXIST) && ( ( ! relation.unique ) || ( ! (relation.mode & R_AUTOLOAD) ) ) )
		  || ( (relation.count == 0) && (relation.mode & R_NEW) && relation.T.allowNew) ) {
			// we only show a related button if there are records or allowNew is true
			hasRelatedTables = 1;		// set the flag to show related line
			// if count is 0, the button will directly open a new record window
			$("<button/>", { role: "button", html: relation.T.description +
					( relation.count > 0 ? " (" + relation.count + ")" : " (add)" )
					})
				.button({ icons: { primary: 
					(relation.count > 0 ? "ui-icon-folder-open" : "ui-icon-document") } })
				.click(relation, relation.T.relatedFunction)
				.appendTo(relatedTables);
		}
	}); // $.each ... related
	if (hasRelatedTables) {
		relatedTables.appendTo(this.jqDialog);
	}
}

Dialog.prototype.show = function () {
	var realThis = this;	// for use in enclosures

	// empty window and set title
	this.jqDialog.text("");
	this.jqDialog.dialog("option", "title", this.title);

	// start with the main Record
	this.mainRecord.showForm(this.jqDialog, true);
	// show forms for all related records
	for (var i in this.relatedRecords) {
		$("<div/>", {	"class": "record_header",
				html: this.relatedRecords[i].T.description } )
			.appendTo(this.jqDialog);
		this.relatedRecords[i].showForm(this.jqDialog, false);
	}
	// show links to related tables (i.e. for whom this record is FOREIGN KEY)
	$("<div/>", {	"class": "record_header",
			html: "Related records" } )
		.appendTo(this.jqDialog);
	this.showRelated();

	// create buttons
	if (! this.mainRecord.T.allowEdit) {
		// make fields readonly if main record is R/O
		this.jqDialog.find("input,select").prop("readonly", "readonly");
		// just one close button
		this.jqDialog.dialog("option", "buttons", {
				"Close":	function() {
							realThis.jqDialog.dialog("close");
						}
				} );
	} else {
		// regular case: editable record
		this.jqDialog.dialog("option", "buttons", [
			{ text:		"OK",
			  icon:		"",
			  click:	function() {
						realThis.save(function() {
							realThis.jqDialog.dialog("close");
						});
					}
			} ,
			{ text:		"Apply",
			  icon:		"",
			  click:	function() {
						realThis.save(function() {
							// afterwards, we refresh the dialog
							realThis.mainRecord.initialise(function() {
								realThis.loadRelated(function() {
									realThis.show();	// show main + related
								});
							});
						});
					}
			} ,
			/*{ text:		"Download",
			  icon:		"ui-icon-arrowthickstop-1-s",
			  click:	function(evnt) {
						evnt.data = {	T:	realThis.mainRecord.T ,
								value:	realThis.mainRecord.key };
			  			realThis.mainRecord.T.downloadOneMenu(evnt);
					}
			} ,*/
			{ text:		"Cancel",
			  icon:		"",
			  click:	function() {
						realThis.jqDialog.dialog("close");
					}
			} ] );
	}

	// finall, open the dialog window
	this.jqDialog.dialog("open");
}

/* save(): recursively save all records */
Dialog.prototype.save = function (callback, i) {
	var realThis = this;

	if (typeof i == "undefined") {	// no argument = first call -> save mainRecord
		this.disable();
		this.mainRecord.save(function () {		// success
			realThis.save(callback, 0);		// recursive call: first relatedRecord
		}, function() {					// failure
			// re-enable the forms, end recursion
			realThis.enable();
		});
	} else {			// i given = related records
		if (i < this.relatedRecords.length) {
			this.relatedRecords[i].save(function () {	// success
					realThis.save(callback, i+1);
				}, function() {				// failure
					// re-enable the forms, end recursion
					realThis.enable();
				});
		} else {
			// when no more related records are to be saved, we first refresh the table behind
			if (this.D.currentTable) {
				this.D.currentTable.show();
			}
			// ... then re-enable the forms
			this.enable();
			// ... and call the ("ultimate") callback
			callback();
		}
	}
}

// disable(): call disableForm on all Record objects
Dialog.prototype.disable = function () {
	this.jqDialog.find("input,select").prop("disabled","disabled");
/*	// start with the main Record
	this.mainRecord.disableForm();
	// ... and all related records
	for (var i in this.relatedRecords) {
		this.relatedRecords[i].disableForm();
	}*/
}

// enable(): call enableForm on all Record objects
Dialog.prototype.enable = function () {
	this.jqDialog.find("input,select").removeProp("disabled");
	// start with the main Record
/*	this.mainRecord.enableForm();
	// ... and all related records
	for (var i in this.relatedRecords) {
		this.relatedRecords[i].enableForm();
	}*/
}

