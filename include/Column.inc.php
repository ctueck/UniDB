<?php

class Column {

	public $D;		# UniDB object
	public $T;		# Table object where the column belongs to

	public $name;		# MySQL name
	public $description;	# display name

	public $data_type;	# data type
	public $length;		# string length or numeric length
	public $decimals;	# precision for floating point types
	public $choices;	# array of choices (for ENUM types)

	public $fe_type;	# frontend type
	public $fe_size;	# frontend size

	public $unique = false;	# flag: column value has to be UNIQUE

	public $default_value;	# default value if any (PHP null if NULL)
	public $is_nullable;	# NULL allowed or NOT NULL?
	public $placeholder;	# placeholder text for <input> field

	public $select_tmpl;	# template expression for SELECT

	public $foreign_key;		# FOREIGN KEY constraint
	public $foreign_table;		# target table
	public $foreign_tableAs;	# target table will be referenced "$foreign_table AS $foreign_tableAs" 
	public $foreign_condition;	# condition for JOINs
	public $foreign_select_condition;	# WHERE condition to limit choices in SELECT boxes
	public $foreign_related_mode;

	/* Constructor */
	public function Column(&$T, $row) {
		$this->T =& $T;
		$this->D =& $T->D;
		// internal name: column name in DB backend
		$this->name = $row['column_name'];
		// description: config value? fallback: DB backend comment? fallback: DB backend column name
		$this->description = $this->conf('name') ? $this->conf('name')
							 : ( $row['column_comment'] ? $row['column_comment'] : $this->name );
		// data type: automatic from DB backend, but can be overridden in config
		$this->data_type = $this->conf('type') ? $this->conf('type') : $row['data_type'];
		// default SELECT expression (might be modified later)
		$this->select_tmpl = "%s";
		// placeholder for <input>, if configured - if not, will be set based on data_type later
		$this->placeholder = $this->conf('placeholder');
		// NOT NULL column or not?
		$this->is_nullable = $row['is_nullable'] == 'YES' ? true : false;

		if ( ($row['column_key'] != 'PRI')				// set default value, unless it's primary key
		  && ($row['column_default'] != 'NULL')				// or default is null or it's a timestamp
		  && ($row['column_default'] != 'CURRENT_TIMESTAMP' ) ) {
			$this->default_value = $row['column_default'];
		} else {
			$this->default_value = null;				// no default value
		}

		if ($row['column_key'] == 'UNI') {				// check if column has a UNIQUE index
			$this->unique = true;
		}

		/*
		 * now, we handle different data types:
		 *
		+-----------------------+-----------------------+-----------------------+
		| SQL/config type	| data_type		| fe_type		|
		+-----------------------+-----------------------+-----------------------+
		| tinytext		| text			| text			|
		| mediumtext		| text			| text			|
		| text			| text			| text			|
		| longtext		| text			| text			|
		+-----------------------+-----------------------+-----------------------+
		| char			| char			| char			|
		| varchar		| char			| char			|
		+-----------------------+-----------------------+-----------------------+
		| tinyint		| int			| char			|
		| int			| int			| char			|
		| bigint		| int			| char			|
		+-----------------------+-----------------------+-----------------------+
		| decimal		| decimal		| char			|
		+-----------------------+-----------------------+-----------------------+
		| boolean		| boolean		| checkbox		|
		+-----------------------+-----------------------+-----------------------+
		| enum			| enum			| select		|
		+-----------------------+-----------------------+-----------------------+
		| date			| date			| date			|
		+-----------------------+-----------------------+-----------------------+
		| year			| year			| year			|
		+-----------------------+-----------------------+-----------------------+
		| (only via config)     | readonly              | readonly              |
		+-----------------------+-----------------------+-----------------------+
		| timestamp		| timestamp		| readonly		|
		+-----------------------+-----------------------+-----------------------+
		*/
		switch ($this->data_type) {
			case 'boolean':
				$this->fe_type = 'checkbox';
				$this->fe_size = 3;
				$this->length = 1;
				$this->select_tmpl = "IF(%s, 'Yes', 'No')";
				break;
			case 'char':
			case 'varchar':
				$this->data_type = 'char';
				$this->length = $row['character_maximum_length'];
				$this->fe_type = 'char';
				$this->fe_size = ( $this->length > $this->D->conf("maxinputsize") ? $this->D->conf("maxinputsize") : $this->length );
				$this->placeholder = $this->placeholder ? $this->placeholder : "Text";
				break;
			case 'tinytext':
			case 'mediumtext':
			case 'text':
			case 'longtext':
				$this->data_type = 'text';
				$this->length = $row['character_maximum_length'];
				$this->fe_type = 'text';
				$this->fe_size = $this->D->conf("maxinputsize");
				$this->placeholder = $this->placeholder ? $this->placeholder : "Text";
				break;
			case 'int':	
			case 'tinyint':	
			case 'bigint':	
				$this->data_type = 'int';
				$this->length = $row['numeric_precision'];
				$this->fe_type = 'char';
				$this->fe_size = $this->length;
				$this->placeholder = $this->placeholder ? $this->placeholder : "0";
				break;
			case 'decimal':	
				$this->length = $row['numeric_precision'];
				$this->decimals = $row['numeric_scale'];
				$this->fe_type = "char";
				$this->fe_size = $this->length;
				$this->placeholder = $this->placeholder ? $this->placeholder : "0.00";
				break;
			case 'enum':	
				$this->fe_type = "select";
				preg_match_all("/\'([^\']*)\'/", $row['column_type'], $matches, PREG_PATTERN_ORDER);
				if ($this->is_nullable) {
					$this->choices[] = array(null, '[not assigned]');
				}
				foreach ($matches[1] AS $choice) {
					$this->choices[] = array($choice, $choice);
				}
				$maxlen = max(array_map('strlen', $matches[1]));
				$this->fe_size = ( $maxlen > $this->D->conf("maxinputsize") ? $this->D->conf("maxinputsize") : $maxlen );
				break;
			case 'date':	
				$this->select_tmpl = "DATE_FORMAT(%s, '".$this->D->conf('dateformat')."')";
				$this->fe_type = "date";
				$this->fe_size = 12;
				$this->placeholder = $this->placeholder ? $this->placeholder : "YYYY-MM-DD";
				break;
			case 'year':
				$this->fe_type = "year";
				$this->fe_size = 4;
				$this->placeholder = $this->placeholder ? $this->placeholder : "YYYY";
				break;
			case 'readonly':
				$this->fe_type = "readonly";
				$this->fe_size = $this->D->conf("maxinputsize");
				break;
			case 'timestamp':	
				$this->fe_type = "readonly";
				$this->fe_size = 20;
				break;
			/*case '':	
				break;*/
			default:
				$this->D->log("Warning: data type ".$row['data_type']." is unsupported.");
				break;
		}

		// handle special columns:
		if ($row['column_key'] == 'PRI') {				// PRIMARY KEY

			$this->T->priKey = $this->name;
	
		} elseif ($row['referenced_table_name']) {			// here we deal with FOREIGN KEYs

			$this->foreign_key = $row['referenced_column_name'];
			$this->foreign_table = $row['referenced_table_name'];
			$this->foreign_tableAs = $this->T->tableName."_".$this->name; //."_".$this->foreign_table;
			// !! this statement will require that the referenced table be completely (!) initialised
			// !! before (!) the current one can finish initialisation. thus, circular FOREIGN KEYs
			// !! would lead to an infinite recursion here.
			// !! TODO: catch recursion somehow
				
			// condition for JOINs
			$this->foreign_condition = $this->foreign_tableAs.".".$this->foreign_key.
					" = ".$this->T->tableName.".".$this->name;
			
			// see if select box should be limited
			$this->foreign_select_condition = ( $this->conf('foreign_select_condition') ?: null );

			// add to list of searchable columns by default
			$this->T->searchColumns[] = $this->name; //$this->foreign_table.".".$this->T->D->T($this->foreign_table)->defName;

			// set information in referenced Column
			$this->foreign_related_mode = ( $this->conf('related_mode') ?: R_DEFAULT );
			$this->D->addRelated($this->foreign_table, $this->foreign_key, $this->T->tableName, $this->name, $this->unique, $this->foreign_related_mode);
			// for UNIQUE foreign keys with AUTOLOAD mode: also add Related entry vice-versa
			if ( $this->unique && ($this->foreign_related_mode & R_AUTOLOAD) ) {
				$this->D->addRelated($this->T->tableName, $this->name, $this->foreign_table, $this->foreign_key, $this->unique, R_AUTOLOAD);
			}

		}

		// (VAR)CHAR columns are used for special roles:
		// 1. default behaviour for ORDER BY and human-readable row name:
		//    first char/varchar type column in the table
		// 2. they are the ones searchable by default
		// TEXT columns are also searchable
		if ($this->data_type == 'char' && !isset($this->foreign_key)) {
			// 1.
			if (!isset($this->T->defOrder)) {
				$this->T->defOrder = 'ORDER BY '.$this->T->tableName.'.'.$this->name;
			}
			if (!isset($this->T->defName)) {
				$this->T->defName = $this->name;
			}
		}
		if ($this->data_type == 'char') {
			// 2.
			$this->T->searchColumns[] = $this->name;
		}

	}

	/*************************************** internal functions *************************************************/
	/* returning data with return()                                                                             */

	public function select ($prefix = null) {
		if (!isset($prefix)) {
			$prefix = $this->T->tableName;
		}

		if (isset($this->foreign_key)) {
			// in SELECT expr, fetch defName column from referenced table (not the column itself)
			return( array(	'expr' => $this->D->T($this->foreign_table)
							->C($this->D->T($this->foreign_table)->defName)
							->select($prefix.'_'.$this->name)['expr'] ,
					'join' => array(     'table' =>	$this->foreign_table ,
								'as' =>	$prefix.'_'.$this->name ,
								'on' => $prefix.'_'.$this->name.'.'.$this->foreign_key.' = '.
									$prefix.'.'.$this->name ) ) );
		} else {
			return( array(	'expr' => sprintf($this->select_tmpl, $prefix . "." . $this->name) .
							' AS ' . $prefix.'_'.$this->name ,
					'join' => null ) );
		}
	}

	public function fieldset ($value, $fullRecord = null) {
		/* return fieldset to be passed to forms */
		$fieldset = array();
		$fieldset["value"] = $value;
		$fieldset["label"] = $this->description;
		// prepare replTable from fullRecord for use by strtr()
		if ( is_array($fullRecord) ) {
			$replTable = array();
			foreach ($fullRecord as $other_field => $other_value) {
				$replTable['%%'.$other_field.'%%'] = $other_value;
			}
		}
		// mark if this is the record name (used e.g. as dialog title)
		if ($this->name == $this->T->defName) {
			$fieldset["isName"] = true;
		}
		// handle whether PRIMARY KEY, FOREIGN KEY or regular column
		if ($this->name == $this->T->priKey) {
			$fieldset["type"] = "readonly";
			$fieldset["size"] = 5;
		} elseif (isset($this->foreign_key)) {
			if ($this->T->allowEdit) {
				$fieldset["type"] = "select";
				$query =	'SELECT '.$this->foreign_key.' AS fkey, '.
						$this->D->T($this->foreign_table)->defName.' AS fvalue '.
						' FROM '.$this->foreign_table.
						( isset($this->foreign_select_condition)        // use condition, if exits
						? ' WHERE ('. ( is_array($fullRecord)           // apply replacement, if given
						? strtr($this->foreign_select_condition, $replTable)
						: $this->foreign_select_condition ).
						') OR ( '.$this->foreign_key.' = '.$this->D->quote($value).' )' : '' ).
						' ORDER BY fvalue';
				$fkl = $this->D->query($query);
				if ($fkl == false) {		// record not found *** CHECK THIS ***
					$this->D->error("record $key not found",404);
				}
				if ($this->is_nullable) {
					$fieldset["options"][] = array(null, '[not assigned]');
				}
				foreach ($fkl as $entry) {
					$fieldset["options"][] = array($entry['fkey'], $entry['fvalue']);
				}
			} else {
				$fieldset["type"] = "readonly";
				$fkValue = $this->D->query('SELECT '.$this->D->T($this->foreign_table)->defName.' FROM '.
					$this->foreign_table.' WHERE ('.$this->foreign_key.' = '.$this->D->quote($value).' )')
					->fetchColumn();
				$fieldset["foreign_value"] = $fkValue;
				$fieldset["size"] = ( strlen($fkValue) > $this->D->conf("maxinputsize") ? $this->D->conf("maxinputsize") : strlen($fkValue) );
			}
			// pass info needed for edit/related button
			$fieldset["foreign_table"] = $this->foreign_table;
			$fieldset["foreign_key"] = $this->foreign_key;
		} else {
			$fieldset["type"] = ( $this->T->allowEdit ? $this->fe_type : 'readonly' );
			$fieldset["size"] = $this->fe_size;
			$fieldset["placeholder"] = $this->placeholder;
			$fieldset["options"] = $this->choices;
		} // if
		return($fieldset);
	}

	public function filter () {
	// return list for filter drop-down
		if (isset($this->choices)) {
			$choices = $this->choices;
		} elseif ($this->data_type == 'text') {
			return(false);
		} elseif ($this->data_type == 'boolean') {
			$choices[] = array(1, 'Yes');
			$choices[] = array(null, 'No');
		} else {
			$choices = array();
			if ($this->is_nullable) {
				$choices[] = array(null, '[not assigned]');
			}
			if (isset($this->foreign_key)) {
				$fkl = $this->D->query(	'SELECT DISTINCT '.$this->T->tableName.'.'.$this->name.' AS fkey, '.
							$this->foreign_table.'.'.$this->D->T($this->foreign_table)->defName.' AS fvalue '.
							' FROM '.$this->T->tableName.
							' LEFT JOIN '.$this->foreign_table.' ON '.$this->foreign_table.'.'.
							$this->foreign_key.' = '.$this->T->tableName.'.'.$this->name.
							' WHERE '.$this->T->tableName.'.'.$this->name.' IS NOT NULL'.
							' ORDER BY fvalue' );
				foreach ($fkl as $entry) {
					$choices[] = array($entry['fkey'], $entry['fvalue']);
				}
			} else {
				$values = $this->D->query('SELECT DISTINCT '.$this->name.' AS value'.
							  ' FROM '.$this->T->tableName.
							  ' WHERE '.$this->name.' IS NOT NULL'.
							  ' ORDER BY value' );
				foreach ($values as $entry) {
					$choices[] = array($entry['value'], $entry['value']);
				}
			}
		}
		return(array(	'column' =>	$this->T->tableName.'.'.$this->name,
				'choices' =>	$choices));
	}

	protected function conf ($var) {
	// an interface to parent UniDB object - read $var from the configuration for this table
		return($this->T->D->conf($var, $this->T->tableName, $this->name));
	}

}

?>
