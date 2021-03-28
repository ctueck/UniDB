/*************************************************************************************************************/
/***** Class: Record - one instance is created ad hoc for editing or creating a new record	 ***************/
/*************************************************************************************************************/

function Record (tableObject, key, keyColumn, callback) {
	// handle parameters
	if (typeof keyColumn == "function") {	// keyColumn is optional
		callback = keyColumn;
		keyColumn = undefined;
	}
	// Object properties
	this.T = tableObject;		// corresponding Table
	this.key = key;			// key value for the record
	this.keyColumn = (keyColumn ? keyColumn : this.T.priKey);
		// normally, the PRIMARY KEY is used to identify a record, unless s.th else is specified
	this.Fields = {};	// will hold Field objects

	this.initialise(callback);
}

// initialise(): initialise with data from dbi.php
Record.prototype.initialise = function (callback) {
	var R = this;		// for use in enclosures
	var cmd;
	var options = this.T.options;		// important for queries: order, search, etc. influence record count/ID

	if (this.key != undefined) {		// we have a Record object for an existing record
		options["key"] = this.keyColumn; // pass name of key column (usually PRIMARY KEY)
	}

	// now we load the record / a blank form from the server:
	this.T.D.cmd("OPTIONS", "/" + this.T.section + "/" + this.T.tableName + "/" + (this.key != undefined ? this.key : "" ) , options, function (metadata) {
		if (R.key != undefined) {
			R.T.D.cmd("GET", "/" + R.T.section + "/" + R.T.tableName + "/" + (R.key != undefined ? R.key : "" ) , options, function (data) {
				R.priKeyValue = data[R.T.priKey];
				R.name = data['_label'];
				R.related = data['_related'] || [];
				R.createFields(metadata["actions"]["PUT"], data, callback);
			}, undefined);
		} else {
			R.createFields(metadata["actions"]["POST"], {}, callback);
			R.related = {}
		}
	}, undefined);
}

// createFields(): make fields according to fetched record structure
Record.prototype.createFields = function (metadata, data, callback) {
	var R = this;
	//	console.log("metadata=", metadata, "data=", data);
	// now we iterate over the columns, and initialise Field objects
	for (var col in metadata) {
		// we don't display the keyColumn if it is different from the PRIMARY KEY
		if (R.Fields[col]) {		// if the field already exists, we only have to update the value
			R.Fields[col].set(data[col]);
		} else {
			if (col.charAt(0) != '_') {
				R.Fields[col] = new Field(R, col, metadata[col], data[col]);
			}
		}
	}
	callback(R);	// call the callback with the new Record object as parameter
}

// showForm() : display an edit form
Record.prototype.showForm = function (jqDialog, setTitle) {
	// jqDialog:	jQuery UI Dialog Object into which the form should be output
	// setTitle:	flag whether title of dialog window should be set
	
	var R = this;	// for use in callback

	// we manipulate the window title if the setTitle flag is set
	if ( setTitle && (this.name != undefined) && (this.name.length > 0) ) {
		jqDialog.dialog("option", "title", this.name);
	}

	// create new, blank edit form
	var editForm = $("<form/>", { id: this.T.tableName });

	var fields = Object.keys(this.Fields);
	// iterate over the columns
	for (var col in fields) {
		this.Fields[fields[col]].showLabel(editForm);
		this.Fields[fields[col]].showField(editForm);
	}

	editForm.appendTo(jqDialog);
}

/* saveForm() : save the Record to database, call callback when done */
Record.prototype.save = function (callback, failCallback) {
	var R = this;		// for use in enclosures

	// we "serialise" manually the Fields values
	var postData = {};
	for (var col in this.Fields) {
		if ( (this.Fields[col].type != undefined) &&
			(this.Fields[col].type != 'raw') && 
			(this.Fields[col].type != 'readonly') && 
			(this.Fields[col].type != 'pre') ) {
				postData[col] = this.Fields[col].value();
		}
	}
	// set PRIMARY KEY (for a new record it will be undefined)
	if (this.priKeyValue) {
		var method = "PUT";
		var url = "/" + this.T.section + "/" + this.T.tableName + "/" + this.priKeyValue;
		postData[this.T.priKey] = this.priKeyValue; //? this.priKeyValue : undefined);
	} else {
		var method = "POST";
		var url = "/" + this.T.section + "/" + this.T.tableName + "/";
	}

	this.T.D.cmd(method, url, postData, function(data) {
		if (R.priKeyValue == undefined) {	// this was a new record
			R.keyColumn = R.T.priKey;
			R.key = data[R.T.priKey];
		}
		callback(R);
	}, failCallback); 
}

