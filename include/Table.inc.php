<?php

class Table {

	public $D;			// UniDB parent object

	public $tableName;		// name of table (in DBS)
	public $tableDescription;	// human-readable name
	public $tableHidden;		// true if hidden - i.e. will not show in menu and not be editable

	public $Columns = array();	// columns in the table
	
	public $priKey = null;		// PRIMARY KEY column(s)

	public $underlyingTable = null;	// for VIEWs, the name of the table that can be edited
					// (the PRIMARY KEY of the table must be part of the VIEW)

	public $allowNew = true;	// permissions to add new records,
	public $allowEdit = true;	// edit records,
	public $allowDelete = true;	// or delete records

	public $searchable = true;	// whether or not Table is searchable - Tables always are

	public $defOrder;		// column for ORDER BY
	public $defName;		// column to use by default as human-readable row identifier
	public $includeGlobalSearch;	// whether or not to include table in global full-text search

	public $defSelect = array();	// default SELECT fields for plain list
	public $searchColumns = array(); // columns for text search

	protected $defaultQuery;
	protected $searchQuery;

	/* Constructor */
	public function Table(&$D, $name) {
		$this->D =& $D;
		$this->tableName = $name;
		
		if ($this->conf('ignore')) {	// ignored or protected table: will never be initialised
			$this->D->log("Tried to initialise Table with ignore flag: '".$this->tableName."'\n\nThis was probably caused by another (non-ignored) table having a FOREIGN KEY reference to an ignored table, which is not possible. Either un-ignore this table or remove the reference; you may still hide this table.", true);
		}

		// first, check basic configuration
		$this->tableHidden = $this->conf('hidden') ? true : false;

		if ($this->conf('description')) {
			$this->tableDescription = $this->conf('description');
		} else {
			$comment = $this->D->dbh->queryOne("SELECT table_comment FROM information_schema.tables
					WHERE table_schema = ".$this->D->dbh->quote($this->D->dbName())."
					AND   table_name   = ".$this->D->dbh->quote($this->tableName));
			$this->tableDescription = $comment ? $comment : $this->tableName;
		}
		
		$this->defName = $this->conf('nameColumn');	// static configuration, overrides auto-guessing
		$this->defOrder = $this->conf('orderColumn') ? 'ORDER BY '.$this->conf('orderColumn') : null;	// dito

		$this->includeGlobalSearch = $this->tableHidden ? false : ( $this->conf('noGlobalSearch') ? false : true );

		/* now, we analyse table description */
		$r = $this->D->dbh->query("
			SELECT		LOWER(columns.column_name) AS column_name, columns.column_comment, 
					columns.column_default, columns.is_nullable,
					columns.data_type, columns.character_maximum_length, columns.numeric_precision,
					columns.numeric_scale, columns.column_type, columns.column_key, columns.extra,
					key_column_usage.referenced_table_name, key_column_usage.referenced_column_name
			FROM		information_schema.columns
			LEFT JOIN	information_schema.key_column_usage ON ( (key_column_usage.table_schema = columns.table_schema)
					AND (key_column_usage.table_name = columns.table_name)
					AND (key_column_usage.column_name = columns.column_name)
					AND (key_column_usage.referenced_table_name IS NOT NULL) )
			WHERE		columns.table_schema = ".$this->D->dbh->quote($this->D->conf('db_name'))."
			AND		columns.table_name = ".$this->D->dbh->quote($this->tableName)."
			ORDER BY	columns.ordinal_position");
		
		if ($r->numRows() == 0) {
			$this->D->log("Tried to initialise Table object for '".$this->tableName."', but does not exist in database.", 1);
		}

		while ($row = $r->fetchRow()) {
			// create new Column object for each
			$this->Columns[$row['column_name']] = new Column($this, $row);
			// add to columns to be shown in lists by default
			$this->defSelect[] = $row['column_name'];
		}

		// if a default array of SELECT columns is configured, we overwrite the auto-guessed one:
		if ($this->conf('defSelect')) {
			$this->defSelect = $this->conf('defSelect');
		}

		// set permissions
		if ($this->conf('permissions') !== null) {
			$this->allowNew = $this->conf('permissions') & P_NEW ? true : false;
			$this->allowEdit = $this->conf('permissions') & P_EDIT ? true : false; 
			$this->allowDelete = $this->conf('permissions') & P_DELETE ? true : false; 
		}

		// if the "table" does not have a PRIMARY KEY, then it's a VIEW, and we need to handle it in different ways:
		//  a) check if an underlying TABLE is specified - otherwise, no editing at all
		//  b) permissions are "masked" (= AND-ed) by underlying TABLE - i.e. VIEW can have more restrictive permissions
		if (!isset($this->priKey)) {
			// VIEWs cannot be edited directly (even if MySQL would permit), but only if we specify the underlying table
			// (new/edit/delete operations then refer to the underlying record)
			if ($this->conf('underlyingTable')) {
				$this->underlyingTable = $this->conf('underlyingTable');
				// NB: PRIMARY KEY of the underlying table must be part of the VIEW - otherwise we throw fatal error:
				if (! $this->C($this->D->T($this->underlyingTable)->priKey)) {
					$this->D->log("configuration specifies ".$this->underlyingTable." as underlying table for view ".$this->tableName.", but PRIMARY KEY column is not contained in the view.", true);
				}
				// "PRIMARY KEY" of the VIEW is same as underlying TABLE's
				$this->priKey = $this->D->T($this->underlyingTable)->priKey;
				// mask permissions (with AND) with underlying TABLE:
				$this->allowNew = $this->allowNew && $this->D->T($this->underlyingTable)->allowNew;
				$this->allowEdit = $this->allowEdit && $this->D->T($this->underlyingTable)->allowEdit;
				$this->allowDelete = $this->allowDelete && $this->D->T($this->underlyingTable)->allowDelete;
			} else {
				// otherwise, it will be read-only (this overrides any other settings made)
				$this->allowNew = false;
				$this->allowEdit = false;
				$this->allowDelete = false;
				// we should specify a key column, it will be used as "PRIMARY KEY"
				if ($this->conf('keyColumn')) {
					$this->priKey = $this->conf('keyColumn');
				} else {
					// if not, issue warning: will not be able to show full records
					$this->D->log("Warning: no keyColumn specified for VIEW '".$this->tableName."' - full records cannot be shown.");
				}
			}
			$logtext = "[VIEW]  ";
		} else {
			$logtext = "[TABLE] ";
		}

		// make sure that PRIMARY KEY is in defSelect
		if (isset($this->priKey) && !in_array($this->priKey, $this->defSelect)) {
			array_unshift($this->defSelect, $this->priKey);
		}

		// log TABLE/VIEW name and effective permissions
		$logtext = $logtext . $this->tableName . "(". ( $this->allowNew ? "N" : "-" ) . ( $this->allowEdit ? "E" : "-" ) . ( $this->allowDelete ? "D" : "-" ) . "):";

		// unlikely, but possible: table has no char columns, so we use PRIMARY KEY as default, or the first column (if no PRI KEY)
		if (!isset($this->defOrder)) {
			$this->defOrder = 'ORDER BY ' . $this->tableName . '.' . ($this->priKey ? $this->priKey : $this->Columns[0]->name);
		}
		if (!isset($this->defName)) {
			$this->defName = $this->priKey ? $this->priKey : $this->Columns[0]->name;
		}

		// finally log what we've done:
		foreach ($this->Columns as $c) {
			$logtext .= ($c->name == $this->priKey ? " *" : " ").$c->name."(".$c->data_type."),";
		}

		$logtext .= $this->includeGlobalSearch ? "" : " (no global search)";

		$this->D->log($logtext);

	}

	/*************************************** internal functions *************************************************/
	/* returning data with return()                                                                             */

	public function initQuery() {
		// make a default query
		$this->defaultQuery = new Query($this->D, array('name' =>		$this->tableName.'.default',
								'description' =>	$this->tableDescription,
								'columns' =>		array($this->tableName => null)));
		// make a search query
		$this->searchQuery = new Query($this->D, array( 'name' =>		$this->tableName.'.search',
								'description' =>	$this->tableDescription,
								'columns' =>		array(	$this->tableName =>
								  				array_merge(	array($this->priKey,
														$this->defName),
														$this->searchColumns
												)
											),
								'orderBy' =>		$this->tableName.'.'.$this->defName
							)
					);

		return(true);
	}

	protected function conf ($var, $column = null) {
	// an interface to parent UniDB object - read $var from the configuration for this table
		return($this->D->conf($var, $this->tableName, $column));
	}

	public function getInfo() {
		$columns = array();
		foreach ($this->Columns as $c) {
			$columns[$c->name] = $c->description;
		}
		return( array(	"name" =>		$this->tableName,
				"description" =>	$this->tableDescription,
				"hidden" =>		$this->tableHidden,
				"priKey" =>		$this->priKey,
				"searchable" =>		$this->searchable,
				"underlyingTable" =>	$this->underlyingTable,
				"allowNew" =>		$this->allowNew,
				"allowEdit" =>		$this->allowEdit,
				"allowDelete" =>	$this->allowDelete,
				"columns" =>		$columns,
				"templates" =>		$this->defaultQuery->Templates,
			));
	}

	public function C($column_name) {
	// returns the Column object for $column_name
		if (!isset($this->Columns[$column_name])) {
			return(null);
		} else {
			return($this->Columns[$column_name]);
		}
	}

	public function columnNames() {
	// return an array of column names in this table (except for the PRIMARY KEY)
		return(array_keys($this->Columns));
	}

	public function isHiddenField($f) {
	// check whether a column is hidden from the list view
		return(	($this->C($f)) && (
			( $f == $this->priKey ) ||			// primary key
			( $this->C($f)->data_type == 'timestamp' )	// timestamp column
		) );
	}

	public function selectExprRec($fields = null, $depth = 0, $prefix = null) {
	// return SELECT expression for the $fields passed as array
	// default: default SELECT expression generated by the constructor
		if ($depth < 0) {
			$this->D->log("function selectExprRec() called with depth < 0", true);
		}
		if (!isset($fields)) {
			$fields = $this->defSelect;
		} elseif ($fields == '*') {
			$fields = $this->columnNames();
		}
		if (!isset($prefix)) {
			$prefix = $this->tableName;
		}
		$select = array();
		$joins = array();
		foreach ($fields as $f) {
			if (!($this->C($f) instanceof Column)) {
				$this->D->log("Column '$f' does not exist in table '$this->tableName' - ".print_r($fields,true),true);
			}
			if ( $this->C($f)->foreign_key && ($depth > 0) ) {
				// for foreign keys and in recursive mode, we need:
				// a) to add a join condition for the referenced table:
				$joins[] = array(	'table' =>	$this->C($f)->foreign_table,
							'as' =>		$prefix . '_' . $f,
							'on' =>		$prefix . '_' . $f . '.' . $this->C($f)->foreign_key . ' = ' .
									$prefix . '.' . $f );
				// b) to merge the whole referenced table:
				$merge = $this->D->T($this->C($f)->foreign_table)
						->selectExprRec('*', $depth-1, $prefix . '_' . $f);
				$select = array_merge($select, $merge['select']);
				$joins = array_merge($joins, $merge['joins']);
			} else {
				$merge = $this->C($f)->select($prefix);
				$select[] = $merge['expr'];
				if (is_array($merge['join'])) {
					$joins[] = $merge['join'];
				}
			}
		}
		return(array("select" => $select, "joins" => $joins));
	}

	public function search ($options) {
	// search: return a list of only PRIMARY KEY + name matching the query
	// (this is used for global search)

		$matchList = array();

		if ($this->includeGlobalSearch) {
			// first, run the query
			$result = $this->searchQuery->search($options, true);
			// reorder results for autocomplete:
			for ($i = 0; $i < count($result["keys"]); $i++) {
				$matchList[] = array(	"table" =>	$this->tableName,
							"key" =>	$this->priKey,
							"value" =>	$result["keys"][$i],
							"label" =>	$result["data"][$i][1],
							"category" =>	$this->tableDescription);
			}
		}
		// return (for aggregation)
		return($matchList);
	}

	
	/*************************************** API routing functions **********************************************/

	public function api_get ($Id, $options) {
		if (empty($Id)) {
			return($this->show($options));
		} elseif ($Id == '-') {
			return($this->newRecord());
		} else {
			return($this->editRecord($Id, isset($options["key"]) ? $options["key"] : null ) );
		}
	}

	public function api_put ($Id, $options) {
		return($this->saveRecord($Id, $options));
	}

	public function api_delete ($Id, $options) {
		if (empty($Id)) {
			$this->D->log("DELETE is only allowed on single records.", true);
		} else {
			return($this->deleteRecord($Id));
		}
	}

	/*************************************** external functions *************************************************/
	/* returning data in JSON format                                                                            */

	public function show ($options) {
	// show the records as a plain table - $options is the query string parameters
		return($this->defaultQuery->show($options));
	} // function show()

	public function download ($options) {
	// download data as CSV
		return($this->defaultQuery->download($options));
	}

	public function downloadOne ($options) {
	// download one single record into OpenDocument File format template

		// make a basic select expression
		$query = $this->D->selectExpr(array($this->tableName => '*'),2);

		// add WHERE based on PRIMARY KEY passed to identify record
		$query .= "\nWHERE ".$this->tableName.'.'.$this->priKey.' = '.$this->D->dbh->quote($options[$this->priKey]);

		$this->D->dbh->setLimit(1);
		$r = $this->D->dbh->queryRow($query);

		if (PEAR::isError($r)) {
			$this->D->log($r->getMessage()."\n\n".$r->getUserinfo(),true);
		}
		if (!isset($r)) {		// record not found
			$this->D->log("record not found",true);
		}

		// we have a result => download as ODT
		$this->D->resultToOdt($options, $r);

	}

	/* edit/view record with primary key = $key */
	public function editRecord ($value, $key = null) {

		if (isset($key) && ($key != $this->priKey) ) {	// we were given a specific key other than the PRIMARY KEY
			// need to check if it exits and is UNIQUE before we use it
			if ($this->C($key) && $this->C($key)->unique) {
				$where = $this->tableName.".".$key." = ".$this->D->dbh->quote($value);
			} else {
				$this->D->log("Tried to load record identified by '$key', but column ".
				( $this->C($key) ? "is not UNIQUE." : "does not exist." ), true);
			}
		} else {		// "normal" case: primary key used to identify record
			$where = $this->tableName.".".$this->priKey." = ".$this->D->dbh->quote($value);
		}

		/*if (!isset($where)) {
			$this->D->log("no PRIMARY or UNIQUE key specified",true);
		}*/

		$this->D->log("Loading record ".$this->tableName."(".$where.")");

		// basic query
		$query = "SELECT ".$this->tableName.".* FROM ".$this->tableName." WHERE ".$where;

		$this->D->dbh->setLimit(1);	// normally not needed, but just in case
		$r = $this->D->dbh->queryRow($query);

		if (PEAR::isError($r)) {
			$this->D->log($r->getMessage()."\n\n".$r->getUserinfo(),true);
		}
		if (!isset($r)) {		// record not found
			$this->D->log("record not found",true);
		}

		// show the actual form
		return($this->showForm($r));
	}

	/* return an empty form to create a new record */
	public function newRecord () {

		if (!$this->allowNew) {
			$this->D->log("creating new records is not allowed for this table",true);
		}

		$emptySet = array();	// this will look like one row result but with empty values
		foreach ($this->Columns as $c) {
			$emptySet[$c->name] = isset($c->default_value) ? $c->default_value : null;
		}
		
		return($this->showForm($emptySet));
	}

	/* show the edit form (helper for editRecord and newRecord) */
	/*  $r : MDB2 result set */
	public function showForm ($r) {
		$fieldset = array();	// this will hold the form info, to be JSON-encoded
		if (count($r) != count($this->Columns)) {
			$this->D->log("Number of columns received from database and known by user interface mismatch. Probably the data structure changed since you logged in, please log out and relogin.", true);
		}
		// all column info
		foreach ($r as $field => $value) {
			if ($this->C($field)) {
				$fieldset[$field] = $this->C($field)->fieldset($value);
			} else {
				$this->D->log("Record contains unknown column '$field'. Probably the data structure changed since you logged in, please log out and relogin.", true);
			}
		} // foreach (over all columns)

		return(	array(	"fieldset" =>	$fieldset,
				"related" =>	( isset($r[$this->priKey])
						  ? $this->D->searchRelated($this->tableName,$fieldset)
						  : array() )
			) 
		);

	} // function showForm()

	/* save a new or existing record */
	public function saveRecord ($Id, $options) {

		if (isset($Id)) {		// saving an existing record

			if (!$this->allowEdit) {
				$this->D->log("editing not allowed on this table",true);
			}

			$query = "UPDATE $this->tableName SET ";

			foreach ($this->Columns as $column) {
				// we'll update all columns that are not PRIMARY KEYS, not timestamps and that are actually supplied
				if ( ($column->name != $this->priKey)
					&& ($column->data_type != 'timestamp')
					&& isset($options[$column->name]) ) {
						$query .= $column->name . " = " . $this->D->dbh->quote($options[$column->name]) . ", ";
				}
			}
			$query = substr($query,0,-2);	// cut off trailing ", "
			$query .= " WHERE $this->priKey = ".$this->D->dbh->quote($Id);
		
			$this->D->dbh->setLimit(1);	// precaution only

		} else {					// new record

			if (!$this->allowNew) {
				$this->D->log("creating new records is not allowed for this table",true);
			}

			$query = "INSERT INTO $this->tableName ( ";
			
			// split columns and values into 2 arrays:
			$insertColumns = array();
			$insertValues = array();
			foreach ($this->Columns as $column) {
				if ( ($column->name != $this->priKey) && ($column->data_type != 'timestamp') ) {
					$insertColumns[] = $column->name;
					if (isset($options[$column->name])) {
						$insertValues[] = $this->D->dbh->quote($options[$column->name]);
					} else {
						$insertValues[] = "NULL";
					}
				}
			}
			$query .= join(",",$insertColumns) . " ) VALUES ( " . join(",",$insertValues) . " )";
			
		}

		$r = $this->D->dbh->exec($query);
		if (PEAR::isError($r)) {
			$this->D->log($r->getMessage()."\n\n".$r->getUserinfo(),true);
		}

		// log query
		$this->D->log($this->D->dbh->last_query.' // '.$r.' row(s) affected');

		/* you'd expect 'if ($r == 0) { error... }' here, but the problem is that 0 rows affected could mean 2 things:
		    a. record does not exist
		    b. clicked apply/ok without any changes
		   in case of a. error will occur in next step, trying to editRecord. thus, no problem that this cannot be caught here */

		if (!isset($Id)) {		// this was a new record
			$Id = $this->D->dbh->lastInsertID();
			if (PEAR::isError($Id)) {
				$this->D->log("Insert failed - ".$Id->getMessage()."\n\n".$Id->getUserinfo(),true);
			}
		}

		// return the PRIMARY KEY
		return(array(	$this->priKey => $Id));

	} /* function saveRecord() */
	
	/* delete a record */
	public function deleteRecord ($Id) {

		if (! $this->allowDelete) {
			$this->D->log("deleting not allowed for this table",true);
		}

		if (!isset($Id)) {		// key not specified -> die()
			$this->D->log("record not specified",true);
		}

		$query = "DELETE FROM $this->tableName WHERE $this->priKey = ".$this->D->dbh->quote($Id);
		$this->D->dbh->setLimit(1);	// precaution only

		$r = $this->D->dbh->exec($query);
		if (PEAR::isError($r)) {
			$this->D->log($r->getMessage()."\n\n".$r->getUserinfo(),true);
		}

		// log query
		$this->D->log($this->D->dbh->last_query.' // '.$r.' row(s) affected');

		if ($r == 0) {
			$this->D->log("It appears nothing could be deleted - maybe someone else did?", "404 Not found");
		}

		// return an empty object as JSON data
		return(array());

	} /* function deleteRecord() */
}


?>
