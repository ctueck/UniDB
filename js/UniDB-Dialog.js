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

    this.show();
}

Dialog.prototype.showRelated = function() {
	var realThis = this;	// for use in enclosures

	var hasRelatedTables = 0;				// flag (decides whether to show related line)
	var relatedTables = $("<div/>", { "class": "field", id: "related_records" } );

	// show buttons for relations
	$.each(( this.mainRecord.related ? this.mainRecord.related : [] ), function(j, relation) {
		relation.T = realThis.D.T(relation.relatedTable);
        if (relation.T) {
			hasRelatedTables = 1;		// set the flag to show related line
			// if count is 0, the button will directly open a new record window
			$("<button/>", { role: "button", html: relation.T.description +
					( relation.count > 0 ? " (" + relation.count + ")" : " (add)" )
					})
				.button({ icons: { primary: 
					(relation.count > 0 ? "ui-icon-folder-open" : "ui-icon-document") } })
				.click(relation, relation.T.relatedFunction)
				.appendTo(relatedTables);
        } else {
            console.log("relation with unknown table [" + relation.relatedTable + "] ignored.");
        }
	//	}
	}); // $.each ... related
	if (hasRelatedTables) {
	    $("<div/>", {	"class": "record_header", text: "Related records" } ).appendTo(this.jqDialog);
		relatedTables.appendTo(this.jqDialog);
	}
}

Dialog.prototype.show = function () {
	var realThis = this;	// for use in enclosures

	// empty window and set title
	this.jqDialog.text("");
	this.jqDialog.dialog("option", "title", this.title);

	// start with the main Record
	this.mainRecord.renderForm(this.jqDialog, true);
	// show links to related tables (i.e. for whom this record is FOREIGN KEY)
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
								realThis.show();
							});
						});
					}
			} ,
			{ text:		"Cancel",
			  icon:		"",
			  click:	function() {
						realThis.jqDialog.dialog("close");
					}
			}
		] );
	}

	// remove any possible close function left over
	this.jqDialog.off("dialogclose");

	// finall, open the dialog window
	this.jqDialog.dialog({
		autoOpen: true,
		maxHeight: $("body").height(),
		width: $("body").width() * 0.8,
		resizable: false,
		modal: true
	});
}

/* save(): save record */
Dialog.prototype.save = function (callback) {
	var realThis = this;

	this.disable();
	this.mainRecord.save(function () {		// success
		// we first refresh the table behind
		if (realThis.D.currentTable) {
			realThis.D.currentTable.show();
		}
		// ... then re-enable the forms
		realThis.enable();
		// ... and call the ("ultimate") callback
		callback();
	}, function() {					// failure
		// re-enable the forms, end recursion
		realThis.enable();
	});
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

