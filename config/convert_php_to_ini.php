<?php
include('../include/constants.php');
include('config.inc.php');

foreach($UniDB_config as $k => $v) {
	if ($k == 'tables') {
		foreach ($v as $kk => $vv) {
			print "[$kk]\n";
			foreach ($vv as $kkk => $vvv) {
				if (is_array($vvv)) {
					print "[$kk.$kkk]\n";
					foreach ($vvv as $kkkk => $vvvv) {
						print "$kkkk=\"$vvvv\"\n";
					}
				} else {
					print "$kkk=\"$vvv\"\n";
				}
			}
		}
	} elseif ($k == 'queries') {
		$i = 0;
		foreach ($v as $vv) {
			print "[.queries.$i]\n";
			foreach ($vv as $kkk => $vvv) {
				if (is_array($vvv)) {
					foreach ($vvv as $tbl => $cols) {
						print $kkk."[$tbl]=\"".implode(",",$cols)."\"\n";
					}
				} else {
					print "$kkk=\"$vvv\"\n";
				}
			}
			$i++;
		}
	} else {
		print "[$k]\n";
		foreach ($v as $kk => $vv) {
			print "$kk=\"$vv\"\n";
		}
	}
}

?>

